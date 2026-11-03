/* The portable model has no DOM, framework, or server dependency. */
(function (root) {
  'use strict';
  const TYPES = { client: 'Cliente', service: 'Servicio', topic: 'Topic', queue: 'Cola', share: 'File share', blob: 'Blob storage', database: 'Base de datos' };
  const KINDS = { http: 'Petición HTTP', reply: 'Respuesta HTTP', publish: 'Publicación', consume: 'Consumo', read: 'Lectura', write: 'Escritura', upload: 'Subida de blob', download: 'Descarga de blob' };
  const ICONS = { client: '▱', service: '◇', topic: '≋', queue: '≋', share: '▤', blob: '⬡', database: '▰' };
  const example = {
  "version": 1,
  "name": "Arquitectura de servicios",
  "description": "Peticiones por mensajería, llamadas REST y acceso a los datos compartidos.",
  "example": true,
  "transport": "kafka",
  "nodes": [
    {
      "id": "client",
      "name": "Cliente externo",
      "type": "client",
      "technology": "Integración cliente",
      "description": "Publica peticiones y recibe las respuestas correlacionadas en un canal independiente.",
      "deployment": "Fuera del sistema",
      "replicas": 1,
      "x": 35,
      "y": 310
    },
    {
      "id": "requests",
      "name": "job.requests",
      "type": "topic",
      "technology": "Apache Kafka",
      "description": "Canal de entrada para peticiones del cliente. Cada mensaje lleva un correlationId.",
      "deployment": "Mensajería / entrada",
      "replicas": 1,
      "x": 295,
      "y": 140
    },
    {
      "id": "responses",
      "name": "job.responses",
      "type": "topic",
      "technology": "Apache Kafka",
      "description": "Canal de salida. El cliente identifica su respuesta por correlationId. El ejemplo no define particiones ni grupos de consumidores.",
      "deployment": "Mensajería / salida",
      "replicas": 1,
      "x": 295,
      "y": 520
    },
    {
      "id": "gateway",
      "name": "Request Service",
      "type": "service",
      "technology": "Servicio de entrada",
      "description": "Consume peticiones, carga configuración del montaje compartido, llama al servicio interno por REST y publica la respuesta.",
      "deployment": "cluster / entrada",
      "replicas": 2,
      "x": 570,
      "y": 140
    },
    {
      "id": "processor",
      "name": "Processing API",
      "type": "service",
      "technology": "REST API",
      "description": "Recibe la llamada interna, lee su configuración y accede a Cosmos DB. El recorrido ampliado también descarga entradas y sube resultados a Blob Storage.",
      "deployment": "cluster / proceso",
      "replicas": 3,
      "x": 570,
      "y": 520
    },
    {
      "id": "share",
      "name": "Configuración",
      "type": "share",
      "technology": "File share · SMB",
      "description": "Disco compartido montado en ambos servicios. Los ficheros de configuración se leen desde /config; este ejemplo no escribe en ese montaje.",
      "deployment": "Montaje /config · solo lectura",
      "replicas": 1,
      "x": 915,
      "y": 140
    },
    {
      "id": "cosmos",
      "name": "Cosmos DB",
      "type": "database",
      "technology": "Azure Cosmos DB",
      "description": "Datos de la aplicación. El ejemplo representa una consulta y la escritura del resultado; los contenedores y partition keys se deben adaptar.",
      "deployment": "Datos / application",
      "replicas": 1,
      "x": 915,
      "y": 355
    },
    {
      "id": "blob",
      "name": "Ficheros",
      "type": "blob",
      "technology": "Azure Blob Storage",
      "description": "Entrada y resultado de un procesamiento de ficheros. Se incluye como recorrido opcional para concretar más adelante.",
      "deployment": "Storage / artifacts",
      "replicas": 1,
      "x": 915,
      "y": 570
    }
  ],
  "edges": [
    {
      "id": "publish-request",
      "source": "client",
      "target": "requests",
      "kind": "publish",
      "label": "Publicar la petición",
      "protocol": "Kafka / TCP",
      "resource": "job.requests · correlationId: req-001",
      "description": "El cliente externo publica una petición con un identificador de correlación.",
      "duration": 70
    },
    {
      "id": "consume-request",
      "source": "requests",
      "target": "gateway",
      "kind": "consume",
      "label": "Consumir la petición",
      "protocol": "Kafka / TCP",
      "resource": "job.requests · correlationId: req-001",
      "description": "Request Service recibe el mensaje del canal de entrada.",
      "duration": 90
    },
    {
      "id": "config-gateway",
      "source": "share",
      "target": "gateway",
      "kind": "read",
      "label": "Leer configuración de entrada",
      "protocol": "SMB",
      "resource": "/config/request-service.json",
      "description": "Request Service solicita este fichero desde el disco montado en modo de solo lectura. La flecha sigue los datos.",
      "duration": 20
    },
    {
      "id": "rest-request",
      "source": "gateway",
      "target": "processor",
      "kind": "http",
      "label": "Invocar el servicio interno",
      "protocol": "HTTP",
      "resource": "POST /process · X-Correlation-ID: req-001",
      "description": "Request Service llama a Processing API por REST y propaga el identificador de correlación.",
      "duration": 80
    },
    {
      "id": "config-processor",
      "source": "share",
      "target": "processor",
      "kind": "read",
      "label": "Leer configuración de proceso",
      "protocol": "SMB",
      "resource": "/config/processing-api.json",
      "description": "Processing API accede a sus ficheros de configuración en el mismo montaje compartido.",
      "duration": 25
    },
    {
      "id": "read-cosmos",
      "source": "cosmos",
      "target": "processor",
      "kind": "read",
      "label": "Consultar Cosmos DB",
      "protocol": "HTTPS / Cosmos SDK",
      "resource": "container: application · partitionKey: customerId",
      "description": "Processing API solicita los datos a Cosmos DB. Esta conexión resume la consulta y representa la dirección del resultado.",
      "duration": 45
    },
    {
      "id": "download-input",
      "source": "blob",
      "target": "processor",
      "kind": "download",
      "label": "Descargar el fichero de entrada",
      "protocol": "HTTPS",
      "resource": "inputs/req-001/source.bin",
      "description": "Processing API solicita el blob de entrada. Este acceso pertenece al recorrido ampliado de ficheros.",
      "duration": 280
    },
    {
      "id": "upload-output",
      "source": "processor",
      "target": "blob",
      "kind": "upload",
      "label": "Subir el fichero de resultado",
      "protocol": "HTTPS",
      "resource": "outputs/req-001/result.bin",
      "description": "Processing API sube el resultado del procesamiento a Blob Storage.",
      "duration": 350
    },
    {
      "id": "write-cosmos",
      "source": "processor",
      "target": "cosmos",
      "kind": "write",
      "label": "Guardar el resultado en Cosmos",
      "protocol": "HTTPS / Cosmos SDK",
      "resource": "container: application · upsert result",
      "description": "Guarda el estado y los metadatos del resultado en Cosmos DB.",
      "duration": 55
    },
    {
      "id": "rest-response",
      "source": "processor",
      "target": "gateway",
      "kind": "reply",
      "label": "Responder a la llamada REST",
      "protocol": "HTTP",
      "resource": "200 OK · { result, correlationId }",
      "description": "Processing API devuelve el resultado a Request Service.",
      "duration": 40
    },
    {
      "id": "publish-response",
      "source": "gateway",
      "target": "responses",
      "kind": "publish",
      "label": "Publicar la respuesta",
      "protocol": "Kafka / TCP",
      "resource": "job.responses · correlationId: req-001",
      "description": "Request Service publica la respuesta en el canal de salida con el mismo correlationId.",
      "duration": 60
    },
    {
      "id": "consume-response",
      "source": "responses",
      "target": "client",
      "kind": "consume",
      "label": "Recibir la respuesta en el cliente",
      "protocol": "Kafka / TCP",
      "resource": "job.responses · correlationId: req-001",
      "description": "El cliente consume el mensaje y lo relaciona con su petición original. La selección y el aislamiento de respuestas dependen del diseño real del cliente.",
      "duration": 80
    }
  ],
  "flows": [
    {
      "id": "request",
      "name": "Petición y respuesta",
      "description": "Del cliente a Kafka, una llamada REST interna y vuelta por el topic de respuestas.",
      "steps": [
        "publish-request",
        "consume-request",
        "config-gateway",
        "rest-request",
        "config-processor",
        "read-cosmos",
        "write-cosmos",
        "rest-response",
        "publish-response",
        "consume-response"
      ]
    },
    {
      "id": "files",
      "name": "Procesar un fichero",
      "description": "El mismo recorrido, incluyendo descarga de entrada y subida de resultado a Blob Storage.",
      "steps": [
        "publish-request",
        "consume-request",
        "config-gateway",
        "rest-request",
        "config-processor",
        "read-cosmos",
        "download-input",
        "upload-output",
        "write-cosmos",
        "rest-response",
        "publish-response",
        "consume-response"
      ]
    },
    {
      "id": "config",
      "name": "Acceso a configuración compartida",
      "description": "Los dos servicios leen sus ficheros desde el mismo disco montado. Aquí se muestran las lecturas en secuencia para explicarlas.",
      "steps": [
        "config-gateway",
        "config-processor"
      ]
    }
  ]
};
  function validate(input) {
    const fail = message => { throw new Error(message); };
    const obj = (value, label) => { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: se esperaba un objeto.`); };
    const str = (value, label, max = 3000, empty = false) => { if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) fail(`${label}: texto ${empty ? '' : 'no vacío '}de hasta ${max} caracteres.`); return value; };
    const id = (value, label) => { str(value, label, 80); if (!/^[a-zA-Z0-9_-]+$/.test(value)) fail(`${label}: usa letras, números, guiones o guiones bajos.`); return value; };
    const list = (value, label, max) => { if (!Array.isArray(value) || value.length > max) fail(`${label}: se esperaba una lista de hasta ${max} elementos.`); return value; };
    const number = (value, label, min, max) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label}: número entre ${min} y ${max}.`); return value; };
    const unique = (items, label) => { const ids = new Set(); items.forEach(item => { if (ids.has(item.id)) fail(`${label}: identificador duplicado «${item.id}».`); ids.add(item.id); }); return ids; };
    obj(input, 'Modelo');
    if (!['kafka', 'servicebus'].includes(input.transport)) fail('Transporte no válido. Usa kafka o servicebus.');
    if (input.version !== 1) fail('Versión de modelo no compatible. Se requiere version: 1.');
    if (typeof input.example !== 'boolean') fail('example debe ser true o false.');
    const model = { version: 1, transport: input.transport, name: str(input.name, 'Nombre del sistema', 120), description: str(input.description, 'Descripción', 1000, true), example: input.example };
    model.nodes = list(input.nodes, 'Componentes', 150).map((n, i) => {
      obj(n, `Componente ${i + 1}`); if (!Object.hasOwn(TYPES, n.type)) fail(`Tipo de componente no válido: ${n.type}`);
      if (!Number.isInteger(n.replicas)) fail(`Réplicas de ${n.id}: se esperaba un entero.`);
      return { id: id(n.id, 'ID de componente'), name: str(n.name, 'Nombre de componente', 80), type: n.type, technology: str(n.technology, 'Tecnología', 120, true), description: str(n.description, 'Descripción', 3000, true), deployment: str(n.deployment, 'Despliegue', 160, true), replicas: number(n.replicas, 'Réplicas', 1, 10000), x: number(n.x, 'Posición X', -10000, 10000), y: number(n.y, 'Posición Y', -10000, 10000) };
    });
    const nodes = unique(model.nodes, 'Componentes');
    model.edges = list(input.edges, 'Conexiones', 500).map((e, i) => {
      obj(e, `Conexión ${i + 1}`);
      if (!nodes.has(e.source) || !nodes.has(e.target)) fail(`Conexión ${e.id}: origen o destino inexistente.`);
      if (e.source === e.target) fail(`Conexión ${e.id}: origen y destino deben ser distintos.`);
      if (!Object.hasOwn(KINDS, e.kind)) fail(`Operación no válida: ${e.kind}`);
      return { id: id(e.id, 'ID de conexión'), source: e.source, target: e.target, kind: e.kind, label: str(e.label, 'Nombre de operación', 120), protocol: str(e.protocol, 'Protocolo', 80, true), resource: str(e.resource, 'Recurso', 500, true), description: str(e.description, 'Descripción', 3000, true), duration: number(e.duration, 'Tiempo ilustrativo (ms)', 1, 600000) };
    });
    const edges = unique(model.edges, 'Conexiones');
    model.flows = list(input.flows, 'Recorridos', 50).map((f, i) => {
      obj(f, `Recorrido ${i + 1}`);
      const steps = list(f.steps, `Pasos de ${f.id}`, 250).map(step => { if (!edges.has(step)) fail(`Recorrido ${f.id}: la conexión «${step}» no existe.`); return step; });
      if (!steps.length) fail(`Recorrido ${f.id}: añade al menos un paso.`);
      return { id: id(f.id, 'ID de recorrido'), name: str(f.name, 'Nombre del recorrido', 120), description: str(f.description, 'Descripción', 3000, true), steps };
    });
    unique(model.flows, 'Recorridos');
    return model;
  }
  function removeEdge(model, edgeId) {
    model.edges = model.edges.filter(e => e.id !== edgeId);
    model.flows = model.flows.map(f => ({ ...f, steps: f.steps.filter(s => s !== edgeId) })).filter(f => f.steps.length);
  }
  function removeNode(model, nodeId) {
    model.edges.filter(e => e.source === nodeId || e.target === nodeId).forEach(e => removeEdge(model, e.id));
    model.nodes = model.nodes.filter(n => n.id !== nodeId);
  }
  function category(edge) { return ['http', 'reply'].includes(edge.kind) ? 'http' : ['publish', 'consume'].includes(edge.kind) ? 'async' : 'storage'; }
  function setTransport(model, transport) {
    if (!['kafka', 'servicebus'].includes(transport)) throw new Error('Transporte no válido.');
    model.transport = transport;
    for (const node of model.nodes) {
      if (!['topic', 'queue'].includes(node.type)) continue;
      node.type = transport === 'kafka' ? 'topic' : 'queue';
      node.technology = transport === 'kafka' ? 'Apache Kafka' : 'Azure Service Bus';
    }
    for (const edge of model.edges) {
      if (['publish', 'consume'].includes(edge.kind)) edge.protocol = transport === 'kafka' ? 'Kafka / TCP' : 'AMQP';
    }
  }
  const api = { TYPES, KINDS, ICONS, example, validate, removeEdge, removeNode, category, setTransport };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AtlasModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
