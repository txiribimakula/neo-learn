'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the single-file domain model without browser timers or a DOM.
function harness(){
  const html = fs.readFileSync(path.join(__dirname, 'scheduler.html'), 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new Function(source);
  const context = {};
  vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf('// initial\n')) + `
    globalThis.api = { getState: () => S, computeWeekCost, nodeCostForPeriod,
      coverageMetrics, coverageText, buildNodeTimeline, enforceNodeCapacity, packNode };
  })();`, context);
  return context.api;
}
const profile = () => Array.from({length:7}, () => Array(24).fill(0));
function fixture(api){
  const state = api.getState();
  const workload = {id:'work',name:'Work',request:2,kedaEnabled:true,replicas:0,hourly:profile(),tolerations:[]};
  const node = {id:'node',name:'Node',capacity:4,maxReplicas:2,pricePerHour:.5,taints:[]};
  state.podTypes = [workload]; state.nodes = [node]; state.day = 0; state.hour = 0;
  return {state,workload,node};
}

test('hour/day/week/month use demand profiles and preserve the live state', () => {
  const api=harness(), {state,workload}=fixture(api);
  workload.hourly[0][0]=2; workload.hourly[0][2]=6; workload.hourly[1][0]=1;
  const before=JSON.stringify(state), result=api.computeWeekCost();
  assert.equal(JSON.stringify(state),before);
  assert.equal(api.getState(),state);
  assert.equal(result.total,2);
  assert.equal(result.perDay[0],1.5);
  assert.equal(result.perDay[1],.5);
  assert.equal(result.instanceHours,4);
  assert.equal(result.pendingPerHour[2],2);
  assert.equal(result.peakCpu,12);
  assert.equal(result.peakPods,6);
  assert.equal(result.requestedPodHours,9);
  for(const [period,expected] of [['hour',.5],['day',1.5],['week',2],['month',2*52/12]]){
    state.nodeCostPeriod=period;
    assert.ok(Math.abs(api.nodeCostForPeriod(result,'node').total-expected)<1e-9);
  }
  state.nodeCostPeriod='hour';state.hour=1;
  assert.equal(api.nodeCostForPeriod(result,'node').total,0);
  assert.equal(api.computeWeekCost(),result);
});

test('capacity, limits, requests, tariffs and fixed replicas affect the projection', () => {
  const api=harness(), {workload,node}=fixture(api);
  workload.kedaEnabled=false;workload.replicas=4;
  assert.equal(api.computeWeekCost().total,168);
  node.pricePerHour=1;assert.equal(api.computeWeekCost().total,336);
  node.maxReplicas=1;
  assert.equal(api.coverageMetrics(api.computeWeekCost()).pending,2*168);
  node.capacity=8;
  assert.equal(api.coverageMetrics(api.computeWeekCost()).pending,0);
  workload.request=10;assert.equal(api.computeWeekCost().total,0);
  assert.equal(api.coverageMetrics(api.computeWeekCost()).pending,4*168);
  workload.replicas=0;
  assert.equal(api.coverageText(api.coverageMetrics(api.computeWeekCost())),'Sin demanda');
});

test('hard taints require matching tolerations and soft taints influence placement', () => {
  const api=harness(),{state,workload,node}=fixture(api);
  workload.kedaEnabled=false;workload.replicas=1;
  for(const effect of ['NoSchedule','NoExecute']){
    node.taints=[{key:'special',value:'true',effect}]; workload.tolerations=[];
    assert.equal(api.computeWeekCost().total,0);
    workload.tolerations=[{key:'special',value:'true',effect}];
    assert.equal(api.computeWeekCost().total,84);
  }
  workload.tolerations=[];node.taints=[{key:'special',value:'true',effect:'PreferNoSchedule'}];
  state.nodes.push({...node,id:'other',taints:[],pricePerHour:1});
  assert.equal(api.computeWeekCost().perNode.node,0);
  assert.equal(api.computeWeekCost().perNode.other,168);
});

test('a partially covered week is never rounded to 100 percent', () => {
  const api=harness();
  assert.equal(api.coverageText({requestedPodHours:100000,pending:1,coverage:99.999}),'99.9 %');
});

test('timeline preserves zero gaps and scales height by total CPU, not replica count alone', () => {
  const api=harness(),{state,node}=fixture(api);
  state.nodes=[{...node,id:'small',capacity:2},{...node,id:'large',capacity:8}];
  const counts={small:Array(168).fill(0),large:Array(168).fill(0)};
  counts.small[1]=1;counts.small[2]=2;counts.large[1]=1;
  const timeline=api.buildNodeTimeline({perNodeHourIH:counts},'week',0);
  assert.equal(timeline.count,168);assert.equal(timeline.start,0);assert.equal(timeline.maxCpu,8);
  assert.equal(timeline.rows[0].slots[0].cpu,0);
  assert.equal(timeline.rows[0].slots[1].cpu,2);
  assert.equal(timeline.rows[0].slots[2].cpu,4);
  assert.equal(timeline.rows[1].slots[1].cpu,8);
  assert.equal(timeline.rows[0].slots[0].cost,0);
});

test('day timeline uses exactly the selected day and its actual hourly prices', () => {
  const api=harness(),{node}=fixture(api);
  const counts=Array(168).fill(0);counts[24]=2;counts[47]=1;counts[48]=3;
  const timeline=api.buildNodeTimeline({perNodeHourIH:{node:counts}},'day',1);
  assert.equal(timeline.count,24);assert.equal(timeline.start,24);
  assert.equal(timeline.rows[0].slots[0].slot,24);
  assert.equal(timeline.rows[0].slots[23].slot,47);
  assert.equal(timeline.maxCpu,node.capacity*2);
  assert.equal(timeline.rows[0].slots[0].cost,1);
  assert.equal(timeline.rows[0].slots[23].cost,.5);
});

test('timeline and cost summary share the same projection without changing state', () => {
  const api=harness(),{state,workload}=fixture(api);
  workload.hourly[0][0]=2;workload.hourly[0][2]=6;
  const before=JSON.stringify(state),cost=api.computeWeekCost();
  const timeline=api.buildNodeTimeline(cost,'week');
  const rowCost=timeline.rows[0].slots.reduce((sum,slot)=>sum+slot.cost,0);
  assert.equal(rowCost,cost.perNode.node);
  assert.equal(timeline.rows[0].slots[1].instances,0);
  assert.equal(JSON.stringify(state),before);
  state.nodes=[];
  assert.equal(api.buildNodeTimeline({perNodeHourIH:{}},'week').maxCpu,0);
});

test('hourly pod placements and pending counts preserve each workload and conserve demand', () => {
  const api=harness(),{state,workload,node}=fixture(api);
  workload.hourly[0][0]=5;workload.hourly[0][1]=1;
  const blocked={...workload,id:'blocked',name:'Blocked',hourly:profile(),request:10};
  blocked.hourly[0][0]=2;state.podTypes.push(blocked);
  const before=JSON.stringify(state),cost=api.computeWeekCost();
  assert.equal(cost.perNodeHourPods.node[0].work,4);
  assert.equal(cost.pendingByType.work[0],1);
  assert.equal(cost.pendingByType.blocked[0],2);
  assert.equal(cost.pendingReasonByType.work,'capacity');
  assert.equal(cost.pendingReasonByType.blocked,'blocked');
  assert.equal(cost.perNodeHourPods.node[1].work,1);
  assert.equal(Object.keys(cost.perNodeHourPods.node[2]).length,0);
  assert.equal(api.buildNodeTimeline(cost,'week').rows[0].slots[0].pods.work,4);
  for(let slot=0;slot<168;slot++){
    for(const t of state.podTypes){
      const placed=state.nodes.reduce((sum,n)=>sum+(cost.perNodeHourPods[n.id][slot][t.id]||0),0);
      assert.equal(placed+cost.pendingByType[t.id][slot],t.hourly[Math.floor(slot/24)][slot%24]);
    }
    assert.equal(state.podTypes.reduce((sum,t)=>sum+cost.pendingByType[t.id][slot],0),cost.pendingPerHour[slot]);
  }
  assert.equal(JSON.stringify(state),before);
  node.taints=[{key:'dedicated',value:'other',effect:'NoSchedule'}];
  assert.equal(api.computeWeekCost().pendingReasonByType.work,'blocked');
  state.nodes=[];
  assert.equal(api.computeWeekCost().pendingByType.work[0],5);
});

test('mixed workload placements retain separate replica counts despite different CPU requests', () => {
  const api=harness(),{state,workload,node}=fixture(api);
  node.capacity=8;node.maxReplicas=1;
  workload.hourly[0][0]=2;
  const other={...workload,id:'other',request:4,hourly:profile()};other.hourly[0][0]=1;
  state.podTypes.push(other);
  const cost=api.computeWeekCost(),pods=cost.perNodeHourPods.node[0];
  assert.equal(pods.work,2);assert.equal(pods.other,1);
  assert.equal(cost.pendingPerHour[0],0);
  assert.equal(cost.perNodeHourIH.node[0],1);
});

test('hourly instance snapshots preserve unused capacity and never split a pod across nodes', () => {
  const api=harness(),{state,workload,node}=fixture(api);
  node.capacity=6;node.maxReplicas=3;workload.request=4;
  workload.hourly[0][0]=3;workload.hourly[0][1]=1;
  const before=JSON.stringify(state),cost=api.computeWeekCost();
  assert.equal(cost.perNodeHourBins.node[0].length,3);
  for(const bin of cost.perNodeHourBins.node[0]){
    assert.equal(bin.used,4);assert.equal(bin.pods.length,1);
    assert.equal(bin.pods[0].typeId,workload.id);
  }
  assert.equal(cost.perNodeHourBins.node[1].length,1);
  assert.equal(cost.perNodeHourBins.node[2].length,0);
  assert.equal(api.buildNodeTimeline(cost,'day',0).rows[0].slots[0].bins.length,3);
  for(let slot=0;slot<168;slot++){
    const bins=cost.perNodeHourBins.node[slot];
    assert.ok(bins.length<=node.maxReplicas);
    let podCount=0;
    for(const bin of bins){
      const used=bin.pods.reduce((cpu,pod)=>cpu+state.podTypes.find(t=>t.id===pod.typeId).request,0);
      assert.equal(used,bin.used);assert.ok(used<=node.capacity);podCount+=bin.pods.length;
    }
    assert.equal(podCount,(cost.perNodeHourPods.node[slot].work||0));
  }
  assert.equal(JSON.stringify(state),before);
});


test('increasing a pod CPU request evicts pods that no longer fit an individual instance', () => {
  const api=harness(),{state,workload,node}=fixture(api);
  state.pods=[{id:'p',typeId:workload.id,index:0,location:node.id}];
  workload.request=5; // Fits the group total (8), but no individual node (4).
  api.enforceNodeCapacity();
  assert.equal(state.pods[0].location,null);
  assert.equal(api.packNode(node).length,0);
});

test('CPU changes respect instance limits even when the total group CPU is sufficient', () => {
  const api=harness(),{state,workload,node}=fixture(api);
  node.capacity=5;node.maxReplicas=2;
  state.pods=Array.from({length:3},(_,index)=>({id:`p${index}`,typeId:workload.id,index,location:node.id}));
  workload.request=3; // 9 CPU < 10 CPU total, but only one pod fits each instance.
  api.enforceNodeCapacity();
  const bins=api.packNode(node);
  assert.equal(bins.length,2);
  assert.ok(bins.every(bin=>bin.used<=node.capacity));
  assert.equal(state.pods.filter(p=>p.location===null).length,1);
});

test('one CPU replicas fit and forecast correctly alongside larger requests', () => {
  const api=harness(),{state,workload,node}=fixture(api);
  workload.request=1;workload.hourly[0][0]=2;node.maxReplicas=1;
  const other={...workload,id:'other',request:2,hourly:profile()};other.hourly[0][0]=1;state.podTypes.push(other);
  const result=api.computeWeekCost();
  assert.equal(result.pendingPerHour[0],0);
  assert.equal(result.perNodeHourBins.node[0][0].used,4);
  assert.equal(result.perNodeHourPods.node[0].work,2);
  assert.equal(result.perNodeHourPods.node[0].other,1);
});
