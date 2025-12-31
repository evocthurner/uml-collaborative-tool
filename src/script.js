/**
 * UML Syncboard – Script principale
 * Include:
 * - Editor UML Class Diagram
 * - Commenti, Review Mode
 * - Snapshot JSON import/export
 * - Diff & Merge
 * - PlantUML export
 * - SVG/PNG export
 * - Undo/Redo
 * - Autosave + Recent Workspaces
 * - Pan/Zoom + Drag/Drop
 *
 * Estensioni future:
 * - Sequence Diagram: Actor, Lifeline, Message con layout verticale
 * - State Machine: Stati, transizioni, entry/exit/do actions
 */

/* -------------------------------------------------------
   STATO PRINCIPALE
------------------------------------------------------- */

const workspaceState = {
  workspaceName: "Default workspace",
  currentDiagram: null,
  importedSnapshot: null,
  reviewMode: false,
  reviewSeverity: "all",
  undoStack: [],
  redoStack: [],
  maxHistory: 50,
};

let currentTool = "select";
let selectedElementId = null;
let selectedConnectionId = null;
let connectionDraft = null;

let dragState = null;
let panState = { active: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 };
let zoom = 1;
let spacePressed = false;

/* SVG references */
const svg = document.getElementById("diagramCanvas");
const elementsLayer = document.getElementById("elementsLayer");
const connectionsLayer = document.getElementById("connectionsLayer");
const commentsLayer = document.getElementById("commentsLayer");

/* UI references */
const inspectorContent = document.getElementById("inspectorContent");
const commentsListEl = document.getElementById("commentsList");
const activityLogEl = document.getElementById("activityLog");
const decisionLogEl = document.getElementById("decisionLog");
const diffListEl = document.getElementById("diffList");
const workspaceNameInput = document.getElementById("workspaceNameInput");
const recentWorkspacesList = document.getElementById("recentWorkspacesList");
const diagramNameLabel = document.getElementById("diagramNameLabel");
const diagramTypeLabel = document.getElementById("diagramTypeLabel");
const versionLabel = document.getElementById("versionLabel");
const zoomSlider = document.getElementById("zoomSlider");
const zoomValue = document.getElementById("zoomValue");
const reviewModeToggle = document.getElementById("reviewModeToggle");
const reviewSeverityFilter = document.getElementById("reviewSeverityFilter");

/* Modal */
const modalOverlay = document.getElementById("modalOverlay");
const modalTitleEl = document.getElementById("modalTitle");
const modalBodyEl = document.getElementById("modalBody");
const modalFooterEl = document.getElementById("modalFooter");
const modalCloseBtn = document.getElementById("modalCloseBtn");

/* -------------------------------------------------------
   UTILS
------------------------------------------------------- */

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function nowIso() {
  return new Date().toISOString();
}

/* -------------------------------------------------------
   DIAGRAMMA DEMO
------------------------------------------------------- */

function createEmptyDiagram() {
  return {
    id: uid(),
    name: "New Class Diagram",
    type: "class",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    versionLabel: "v1",
    elements: [],
    connections: [],
    comments: [],
    activityLog: [],
    decisionLog: [],
  };
}

function createDemoDiagram() {
  const d = createEmptyDiagram();
  d.name = "Demo: Order Management";
  d.versionLabel = "v1-demo";

  const classes = [
    {
      id: "c_customer",
      x: 200,
      y: 180,
      w: 160,
      h: 110,
      name: "Customer",
      stereotype: "",
      attributes: ["+ id: int", "+ name: string", "+ email: string"],
      methods: ["+ placeOrder(o: Order): void"],
      kind: "class",
    },
    {
      id: "c_order",
      x: 430,
      y: 200,
      w: 170,
      h: 120,
      name: "Order",
      stereotype: "",
      attributes: ["+ id: int", "+ createdAt: Date", "+ status: OrderStatus"],
      methods: ["+ addItem(item: OrderItem): void", "+ getTotal(): Money"],
      kind: "class",
    },
    {
      id: "c_orderItem",
      x: 690,
      y: 220,
      w: 170,
      h: 110,
      name: "OrderItem",
      stereotype: "",
      attributes: ["+ quantity: int", "+ price: Money"],
      methods: [],
      kind: "class",
    },
    {
      id: "c_product",
      x: 690,
      y: 60,
      w: 170,
      h: 100,
      name: "Product",
      stereotype: "",
      attributes: ["+ sku: string", "+ name: string"],
      methods: [],
      kind: "class",
    },
    {
      id: "c_payment",
      x: 430,
      y: 60,
      w: 170,
      h: 110,
      name: "Payment",
      stereotype: "",
      attributes: ["+ id: int", "+ amount: Money", "+ status: PaymentStatus"],
      methods: ["+ capture(): bool"],
      kind: "class",
    },
    {
      id: "i_repository",
      x: 200,
      y: 40,
      w: 180,
      h: 90,
      name: "OrderRepository",
      stereotype: "«interface»",
      attributes: [],
      methods: ["+ findById(id: int): Order", "+ save(o: Order): void"],
      kind: "interface",
    },
  ];
  d.elements = classes.map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    w: c.w,
    h: c.h,
    name: c.name,
    stereotype: c.stereotype || "",
    attributes: c.attributes,
    methods: c.methods,
    visibility: { public: true },
    kind: c.kind,
  }));

  d.connections = [
    {
      id: "rel_customer_order",
      type: "association",
      fromId: "c_customer",
      toId: "c_order",
      label: "places",
      multiplicityFrom: "1",
      multiplicityTo: "0..*",
    },
    {
      id: "rel_order_orderItem",
      type: "association",
      fromId: "c_order",
      toId: "c_orderItem",
      label: "contains",
      multiplicityFrom: "1",
      multiplicityTo: "1..*",
    },
    {
      id: "rel_orderItem_product",
      type: "association",
      fromId: "c_orderItem",
      toId: "c_product",
      label: "for",
      multiplicityFrom: "0..*",
      multiplicityTo: "1",
    },
    {
      id: "rel_order_payment",
      type: "association",
      fromId: "c_order",
      toId: "c_payment",
      label: "paidBy",
      multiplicityFrom: "0..1",
      multiplicityTo: "1",
    },
    {
      id: "rel_payment_status",
      type: "dependency",
      fromId: "c_payment",
      toId: "c_order",
      label: "updates status",
      multiplicityFrom: "",
      multiplicityTo: "",
    },
    {
      id: "rel_order_inherits",
      type: "inheritance",
      fromId: "c_order",
      toId: "i_repository",
      label: "",
      multiplicityFrom: "",
      multiplicityTo: "",
    },
    {
      id: "rel_repo_realization",
      type: "realization",
      fromId: "c_order",
      toId: "i_repository",
      label: "",
      multiplicityFrom: "",
      multiplicityTo: "",
    },
    {
      id: "rel_customer_dependency",
      type: "dependency",
      fromId: "c_customer",
      toId: "i_repository",
      label: "reads",
      multiplicityFrom: "",
      multiplicityTo: "",
    },
  ];

  d.comments = [
    {
      commentId: uid(),
      targetElementId: "c_order",
      targetConnectionId: null,
      author: "Massimiliano",
      text: "Order.getTotal() should return a value object.",
      severity: "info",
      status: "open",
      createdAt: nowIso(),
    },
    {
      commentId: uid(),
      targetElementId: "c_payment",
      targetConnectionId: null,
      author: "Reviewer A",
      text: "PaymentStatus missing 'REFUNDED'?",
      severity: "warn",
      status: "open",
      createdAt: nowIso(),
    },
    {
      commentId: uid(),
      targetElementId: null,
      targetConnectionId: "rel_repo_realization",
      author: "Reviewer B",
      text: "Is this a realization or a dependency?",
      severity: "blocker",
      status: "open",
      createdAt: nowIso(),
    },
    {
      commentId: uid(),
      targetElementId: "c_customer",
      targetConnectionId: null,
      author: "Reviewer C",
      text: "Consider adding phoneNumber.",
      severity: "info",
      status: "resolved",
      createdAt: nowIso(),
    },
  ];

  d.activityLog.push({
    time: nowIso(),
    author: "System",
    actionType: "create",
    summary: "Demo diagram created",
  });

  d.decisionLog.push({
    time: nowIso(),
    author: "Team",
    title: "Use value object for Money",
    reason: "Consistency across bounded contexts",
  });

  return d;
}

/* -------------------------------------------------------
   UNDO / REDO
------------------------------------------------------- */

function pushHistory() {
  const snapshot = JSON.stringify(workspaceState.currentDiagram);
  workspaceState.undoStack.push(snapshot);
  if (workspaceState.undoStack.length > workspaceState.maxHistory) {
    workspaceState.undoStack.shift();
  }
  workspaceState.redoStack = [];
}

function undo() {
  if (!workspaceState.undoStack.length) return;
  const current = JSON.stringify(workspaceState.currentDiagram);
  workspaceState.redoStack.push(current);
  const prev = workspaceState.undoStack.pop();
  workspaceState.currentDiagram = JSON.parse(prev);
  render();
}

function redo() {
  if (!workspaceState.redoStack.length) return;
  const current = JSON.stringify(workspaceState.currentDiagram);
  workspaceState.undoStack.push(current);
  const next = workspaceState.redoStack.pop();
  workspaceState.currentDiagram = JSON.parse(next);
  render();
}

/* -------------------------------------------------------
   AUTOSAVE + WORKSPACES
------------------------------------------------------- */

function autosave() {
  if (!workspaceState.currentDiagram) return;
  const key = `umlSyncboard:${workspaceState.workspaceName}`;
  localStorage.setItem(key, JSON.stringify(workspaceState.currentDiagram));
  updateRecentWorkspaces(workspaceState.workspaceName);
}

function loadWorkspace(name) {
  const key = `umlSyncboard:${name}`;
  const raw = localStorage.getItem(key);
  if (raw) {
    workspaceState.workspaceName = name;
    workspaceNameInput.value = name;
    workspaceState.currentDiagram = JSON.parse(raw);
    render();
  }
}

function updateRecentWorkspaces(name) {
  const key = "umlSyncboard:recent";
  const raw = localStorage.getItem(key);
  let list = raw ? JSON.parse(raw) : [];
  list = list.filter((n) => n !== name);
  list.unshift(name);
  if (list.length > 5) list = list.slice(0, 5);
  localStorage.setItem(key, JSON.stringify(list));
  renderRecentWorkspaces(list);
}

function loadRecentWorkspacesFromStorage() {
  const raw = localStorage.getItem("umlSyncboard:recent");
  const list = raw ? JSON.parse(raw) : [];
  renderRecentWorkspaces(list);
}

function renderRecentWorkspaces(list) {
  recentWorkspacesList.innerHTML = "";
  list.forEach((name) => {
    const li = document.createElement("li");
    li.textContent = name;
    li.addEventListener("click", () => loadWorkspace(name));
    recentWorkspacesList.appendChild(li);
  });
}

/* -------------------------------------------------------
   RENDER PRINCIPALE
------------------------------------------------------- */

function render() {
  if (!workspaceState.currentDiagram) return;
  const d = workspaceState.currentDiagram;

  diagramNameLabel.textContent = d.name;
  diagramTypeLabel.textContent = d.type === "class" ? "Class Diagram" : d.type;
  versionLabel.textContent = d.versionLabel;

  renderElements();
  renderConnections();
  renderComments();
  renderInspector();
  renderActivityLog();
  renderDecisionLog();
  renderDiffList();
  autosave();
}
/* -------------------------------------------------------
   RENDER ELEMENTI
------------------------------------------------------- */

function renderElements() {
  elementsLayer.innerHTML = "";
  const d = workspaceState.currentDiagram;

  d.elements.forEach((el) => {
    if (workspaceState.reviewMode && !elementHasOpenComment(el.id)) return;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("uml-class");
    if (selectedElementId === el.id) g.classList.add("selected");
    g.setAttribute("data-id", el.id);
    g.setAttribute("transform", `translate(${el.x}, ${el.y})`);

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", el.w);
    rect.setAttribute("height", el.h);
    g.appendChild(rect);

    const nameBg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    nameBg.setAttribute("width", el.w);
    nameBg.setAttribute("height", 24);
    nameBg.setAttribute("class", "class-name-bg");
    g.appendChild(nameBg);

    const nameText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    nameText.setAttribute("x", 6);
    nameText.setAttribute("y", 16);
    nameText.textContent = (el.stereotype ? el.stereotype + " " : "") + el.name;
    g.appendChild(nameText);

    const attrsText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    attrsText.setAttribute("x", 6);
    attrsText.setAttribute("y", 38);
    let offset = 0;
    (el.attributes || []).forEach((line) => {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      t.setAttribute("x", 6);
      t.setAttribute("dy", offset === 0 ? 0 : 13);
      t.textContent = line;
      attrsText.appendChild(t);
      offset++;
    });
    g.appendChild(attrsText);

    const methodsText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    methodsText.setAttribute("x", 6);
    methodsText.setAttribute("y", 38 + (el.attributes || []).length * 13 + 12);
    offset = 0;
    (el.methods || []).forEach((line) => {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
      t.setAttribute("x", 6);
      t.setAttribute("dy", offset === 0 ? 0 : 13);
      t.textContent = line;
      methodsText.appendChild(t);
      offset++;
    });
    g.appendChild(methodsText);

    elementsLayer.appendChild(g);
  });
}

function elementHasOpenComment(id) {
  const d = workspaceState.currentDiagram;
  return d.comments.some((c) => c.targetElementId === id && c.status === "open");
}

/* -------------------------------------------------------
   RENDER CONNESSIONI
------------------------------------------------------- */

function renderConnections() {
  connectionsLayer.innerHTML = "";
  const d = workspaceState.currentDiagram;

  d.connections.forEach((c) => {
    const from = d.elements.find((e) => e.id === c.fromId);
    const to = d.elements.find((e) => e.id === c.toId);
    if (!from || !to) return;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.classList.add("uml-connection");
    if (c.type === "dependency") g.classList.add("dependency");
    if (selectedConnectionId === c.id) g.classList.add("selected");
    g.setAttribute("data-id", c.id);

    const x1 = from.x + from.w / 2;
    const y1 = from.y + from.h / 2;
    const x2 = to.x + to.w / 2;
    const y2 = to.y + to.h / 2;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x1);
    line.setAttribute("y1", y1);
    line.setAttribute("x2", x2);
    line.setAttribute("y2", y2);
    g.appendChild(line);

    if (c.label) {
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", (x1 + x2) / 2 + 4);
      t.setAttribute("y", (y1 + y2) / 2 - 4);
      t.setAttribute("fill", "#e5e7ff");
      t.setAttribute("font-size", "10");
      t.textContent = c.label;
      g.appendChild(t);
    }

    connectionsLayer.appendChild(g);
  });
}

/* -------------------------------------------------------
   RENDER COMMENTI
------------------------------------------------------- */

function renderComments() {
  commentsLayer.innerHTML = "";
  commentsListEl.innerHTML = "";
  const d = workspaceState.currentDiagram;

  const severityFilter = workspaceState.reviewSeverity;
  const reviewOnly = workspaceState.reviewMode;

  d.comments.forEach((c) => {
    if (reviewOnly && c.status !== "open") return;
    if (severityFilter !== "all" && c.severity !== severityFilter) return;

    // Inspector list
    const item = document.createElement("div");
    item.className = "comment-item";

    const header = document.createElement("div");
    header.className = "comment-header";

    const sev = document.createElement("span");
    sev.className = "comment-chip " + c.severity;
    sev.textContent = c.severity.toUpperCase();

    const status = document.createElement("span");
    status.textContent = c.status;

    header.appendChild(sev);
    header.appendChild(status);

    const body = document.createElement("div");
    body.className = "comment-body";
    body.textContent = `${c.author}: ${c.text}`;

    item.appendChild(header);
    item.appendChild(body);

    if (c.status === "open") {
      const btn = document.createElement("button");
      btn.className = "btn small";
      btn.textContent = "Resolve";
      btn.addEventListener("click", () => resolveComment(c.commentId));
      item.appendChild(btn);
    }

    commentsListEl.appendChild(item);

    // Badge on canvas
    const pos = getCommentTargetPosition(c);
    if (!pos) return;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", pos.x);
    circle.setAttribute("cy", pos.y);
    circle.setAttribute("r", 7);
    circle.classList.add("comment-badge", c.severity);
    g.appendChild(circle);

    commentsLayer.appendChild(g);
  });
}

function getCommentTargetPosition(comment) {
  const d = workspaceState.currentDiagram;

  if (comment.targetElementId) {
    const el = d.elements.find((e) => e.id === comment.targetElementId);
    if (!el) return null;
    return { x: el.x + el.w - 8, y: el.y + 10 };
  }

  if (comment.targetConnectionId) {
    const conn = d.connections.find((c) => c.id === comment.targetConnectionId);
    if (!conn) return null;

    const from = d.elements.find((e) => e.id === conn.fromId);
    const to = d.elements.find((e) => e.id === conn.toId);
    if (!from || !to) return null;

    return {
      x: (from.x + from.w / 2 + to.x + to.w / 2) / 2,
      y: (from.y + from.h / 2 + to.y + to.h / 2) / 2,
    };
  }

  return null;
}
/* -------------------------------------------------------
   RENDER INSPECTOR
------------------------------------------------------- */

function renderInspector() {
  const d = workspaceState.currentDiagram;
  inspectorContent.innerHTML = "";
  inspectorContent.classList.remove("empty");

  if (selectedElementId) {
    const el = d.elements.find((e) => e.id === selectedElementId);
    if (!el) {
      inspectorContent.classList.add("empty");
      inspectorContent.innerHTML = "<p>No selection</p>";
      return;
    }

    const html = `
      <div>
        <label>Name</label>
        <input id="inspName" class="input" value="${el.name}" />
        <label>Stereotype</label>
        <input id="inspStereo" class="input" value="${el.stereotype || ""}" />
        <label>Attributes (one per line)</label>
        <textarea id="inspAttrs" class="input" rows="4">${(el.attributes || []).join("\n")}</textarea>
        <label>Methods (one per line)</label>
        <textarea id="inspMethods" class="input" rows="4">${(el.methods || []).join("\n")}</textarea>
        <button id="inspSave" class="btn small">Save</button>
      </div>
    `;
    inspectorContent.innerHTML = html;

    document.getElementById("inspSave").onclick = () => {
      pushHistory();
      el.name = document.getElementById("inspName").value.trim();
      el.stereotype = document.getElementById("inspStereo").value.trim();
      el.attributes = document
        .getElementById("inspAttrs")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      el.methods = document
        .getElementById("inspMethods")
        .value.split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      el.updatedAt = nowIso();
      logActivity("update", `Updated element ${el.name}`);
      render();
    };

  } else if (selectedConnectionId) {
    const c = d.connections.find((c) => c.id === selectedConnectionId);
    if (!c) {
      inspectorContent.classList.add("empty");
      inspectorContent.innerHTML = "<p>No selection</p>";
      return;
    }

    const html = `
      <div>
        <label>Type</label>
        <input class="input" value="${c.type}" disabled />
        <label>Label</label>
        <input id="inspConnLabel" class="input" value="${c.label || ""}" />
        <label>Multiplicity from</label>
        <input id="inspMultFrom" class="input" value="${c.multiplicityFrom || ""}" />
        <label>Multiplicity to</label>
        <input id="inspMultTo" class="input" value="${c.multiplicityTo || ""}" />
        <button id="inspConnSave" class="btn small">Save</button>
      </div>
    `;
    inspectorContent.innerHTML = html;

    document.getElementById("inspConnSave").onclick = () => {
      pushHistory();
      c.label = document.getElementById("inspConnLabel").value.trim();
      c.multiplicityFrom = document.getElementById("inspMultFrom").value.trim();
      c.multiplicityTo = document.getElementById("inspMultTo").value.trim();
      logActivity("update", `Updated connection ${c.id}`);
      render();
    };

  } else {
    inspectorContent.classList.add("empty");
    inspectorContent.innerHTML = "<p>No selection</p>";
  }
}

/* -------------------------------------------------------
   RENDER ACTIVITY LOG
------------------------------------------------------- */

function renderActivityLog() {
  activityLogEl.innerHTML = "";
  const log = workspaceState.currentDiagram.activityLog.slice(-50);
  log.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `[${entry.time}] ${entry.author} - ${entry.actionType}: ${entry.summary}`;
    activityLogEl.appendChild(li);
  });
}

/* -------------------------------------------------------
   RENDER DECISION LOG
------------------------------------------------------- */

function renderDecisionLog() {
  decisionLogEl.innerHTML = "";
  const log = workspaceState.currentDiagram.decisionLog;
  log.forEach((d) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="decision-title">${d.title}</div>
      <div class="decision-reason">${d.reason}</div>
    `;
    decisionLogEl.appendChild(li);
  });
}

/* -------------------------------------------------------
   RENDER DIFF LIST
------------------------------------------------------- */

function renderDiffList() {
  diffListEl.innerHTML = "";
  if (!workspaceState.importedSnapshot) return;

  const diff = buildDiff();
  diff.forEach((item, idx) => {
    const li = document.createElement("li");
    li.textContent = `${item.kind} - ${item.summary}`;
    if (item.conflict) li.textContent += " [CONFLICT]";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.dataset.index = idx;

    li.prepend(cb);
    diffListEl.appendChild(li);
  });
}

/* -------------------------------------------------------
   LOGGING
------------------------------------------------------- */

function logActivity(actionType, summary, author = "User") {
  const entry = {
    time: nowIso(),
    author,
    actionType,
    summary,
  };
  workspaceState.currentDiagram.activityLog.push(entry);
}

/* -------------------------------------------------------
   CRUD ELEMENTI
------------------------------------------------------- */

function addElement(kind) {
  pushHistory();
  const d = workspaceState.currentDiagram;

  const el = {
    id: uid(),
    x: 120 + Math.random() * 200,
    y: 120 + Math.random() * 200,
    w: 160,
    h: 90,
    name: kind === "interface" ? "NewInterface" : "NewClass",
    stereotype: kind === "interface" ? "«interface»" : "",
    attributes: [],
    methods: [],
    visibility: { public: true },
    kind,
  };

  d.elements.push(el);
  selectedElementId = el.id;
  selectedConnectionId = null;

  logActivity("create", `Added ${kind} ${el.name}`);
  render();
}

function updateElement(id, changes) {
  pushHistory();
  const el = workspaceState.currentDiagram.elements.find((e) => e.id === id);
  if (!el) return;
  Object.assign(el, changes);
  el.updatedAt = nowIso();
  logActivity("update", `Updated element ${el.name}`);
  render();
}

function deleteElement(id) {
  pushHistory();
  const d = workspaceState.currentDiagram;

  d.elements = d.elements.filter((e) => e.id !== id);
  d.connections = d.connections.filter(
    (c) => c.fromId !== id && c.toId !== id
  );
  d.comments = d.comments.filter(
    (c) => c.targetElementId !== id
  );

  if (selectedElementId === id) selectedElementId = null;

  logActivity("delete", `Deleted element ${id}`);
  render();
}
/* -------------------------------------------------------
   CRUD CONNESSIONI
------------------------------------------------------- */

function addConnection(type, fromId, toId) {
  pushHistory();
  const d = workspaceState.currentDiagram;

  const conn = {
    id: uid(),
    type,
    fromId,
    toId,
    label: "",
    multiplicityFrom: "",
    multiplicityTo: "",
  };

  d.connections.push(conn);
  selectedConnectionId = conn.id;
  selectedElementId = null;

  logActivity("connect", `Created ${type} from ${fromId} to ${toId}`);
  render();
}

function deleteConnection(id) {
  pushHistory();
  const d = workspaceState.currentDiagram;

  d.connections = d.connections.filter((c) => c.id !== id);
  d.comments = d.comments.filter((c) => c.targetConnectionId !== id);

  if (selectedConnectionId === id) selectedConnectionId = null;

  logActivity("delete", `Deleted connection ${id}`);
  render();
}

/* -------------------------------------------------------
   COMMENTI
------------------------------------------------------- */

function addComment(targetElementId, targetConnectionId, author, text, severity) {
  pushHistory();
  const d = workspaceState.currentDiagram;

  const c = {
    commentId: uid(),
    targetElementId,
    targetConnectionId,
    author,
    text,
    severity,
    status: "open",
    createdAt: nowIso(),
  };

  d.comments.push(c);
  logActivity("comment", `Added comment on ${targetElementId || targetConnectionId}`);
  render();
}

function resolveComment(commentId) {
  pushHistory();
  const d = workspaceState.currentDiagram;
  const c = d.comments.find((x) => x.commentId === commentId);
  if (!c) return;
  c.status = "resolved";
  logActivity("resolve", `Resolved comment ${commentId}`);
  render();
}

/* -------------------------------------------------------
   SNAPSHOT EXPORT / IMPORT
------------------------------------------------------- */

function exportSnapshot() {
  const data = JSON.stringify(workspaceState.currentDiagram, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${workspaceState.currentDiagram.name.replace(/\s+/g, "_")}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

function importSnapshot(json) {
  try {
    const data = JSON.parse(json);
    workspaceState.importedSnapshot = data;
    logActivity("import", "Imported snapshot");
    render();
  } catch (e) {
    alert("Invalid JSON snapshot");
  }
}

/* -------------------------------------------------------
   DIFF & MERGE
------------------------------------------------------- */

function buildDiff() {
  const base = workspaceState.currentDiagram;
  const other = workspaceState.importedSnapshot;
  if (!other) return [];

  const diff = [];

  // Elements added
  other.elements.forEach((el) => {
    if (!base.elements.find((e) => e.id === el.id)) {
      diff.push({
        kind: "element-added",
        id: el.id,
        summary: `Element added: ${el.name}`,
        apply: () => {
          base.elements.push(JSON.parse(JSON.stringify(el)));
        },
      });
    }
  });

  // Elements removed
  base.elements.forEach((el) => {
    if (!other.elements.find((e) => e.id === el.id)) {
      diff.push({
        kind: "element-removed",
        id: el.id,
        summary: `Element removed: ${el.name}`,
        apply: () => {
          base.elements = base.elements.filter((e) => e.id !== el.id);
        },
      });
    }
  });

  // Elements modified
  other.elements.forEach((elB) => {
    const elA = base.elements.find((e) => e.id === elB.id);
    if (!elA) return;

    const fields = ["name", "stereotype", "attributes", "methods", "x", "y", "w", "h"];
    let changed = false;
    fields.forEach((f) => {
      if (JSON.stringify(elA[f]) !== JSON.stringify(elB[f])) changed = true;
    });

    if (changed) {
      diff.push({
        kind: "element-modified",
        id: elA.id,
        summary: `Element modified: ${elA.name}`,
        conflict: false,
        apply: () => {
          Object.assign(elA, JSON.parse(JSON.stringify(elB)));
        },
      });
    }
  });

  // Connections added
  other.connections.forEach((c) => {
    if (!base.connections.find((x) => x.id === c.id)) {
      diff.push({
        kind: "connection-added",
        id: c.id,
        summary: `Connection added: ${c.type}`,
        apply: () => {
          base.connections.push(JSON.parse(JSON.stringify(c)));
        },
      });
    }
  });

  // Connections removed
  base.connections.forEach((c) => {
    if (!other.connections.find((x) => x.id === c.id)) {
      diff.push({
        kind: "connection-removed",
        id: c.id,
        summary: `Connection removed: ${c.type}`,
        apply: () => {
          base.connections = base.connections.filter((x) => x.id !== c.id);
        },
      });
    }
  });

  // Comments added
  other.comments.forEach((c) => {
    if (!base.comments.find((x) => x.commentId === c.commentId)) {
      diff.push({
        kind: "comment-added",
        id: c.commentId,
        summary: `Comment added (${c.severity})`,
        apply: () => {
          base.comments.push(JSON.parse(JSON.stringify(c)));
        },
      });
    }
  });

  // Comments resolved
  other.comments.forEach((c) => {
    const baseC = base.comments.find((x) => x.commentId === c.commentId);
    if (baseC && baseC.status !== c.status) {
      diff.push({
        kind: "comment-status-changed",
        id: c.commentId,
        summary: `Comment ${c.commentId} status changed`,
        apply: () => {
          baseC.status = c.status;
        },
      });
    }
  });

  return diff;
}

function applyDiff(selectedOnly = false) {
  const diff = buildDiff();
  const items = diffListEl.querySelectorAll("input[type=checkbox]");

  diff.forEach((item, idx) => {
    if (selectedOnly && !items[idx].checked) return;
    item.apply();
  });

  logActivity("merge", "Applied diff");
  render();
}
/* -------------------------------------------------------
   PLANTUML EXPORT
------------------------------------------------------- */

function exportPlantUML() {
  const d = workspaceState.currentDiagram;
  if (d.type !== "class") {
    alert("PlantUML export is only available for Class Diagrams.");
    return;
  }

  let out = "@startuml\n\n";

  // Classes & interfaces
  d.elements.forEach((el) => {
    if (el.kind === "interface") {
      out += `interface ${el.name} {\n`;
    } else {
      out += `class ${el.name} {\n`;
    }

    (el.attributes || []).forEach((a) => {
      out += `  ${a}\n`;
    });
    (el.methods || []).forEach((m) => {
      out += `  ${m}\n`;
    });

    out += "}\n\n";
  });

  // Connections
  d.connections.forEach((c) => {
    const from = d.elements.find((e) => e.id === c.fromId);
    const to = d.elements.find((e) => e.id === c.toId);
    if (!from || !to) return;

    let arrow = "--";
    if (c.type === "inheritance") arrow = " --|> ";
    if (c.type === "realization") arrow = " ..|> ";
    if (c.type === "dependency") arrow = " ..> ";
    if (c.type === "association") arrow = " -- ";

    out += `${from.name}${arrow}${to.name}`;
    if (c.label) out += ` : ${c.label}`;
    out += "\n";
  });

  out += "\n@enduml";

  navigator.clipboard.writeText(out).then(() => {
    alert("PlantUML copied to clipboard!");
  });
}

/* -------------------------------------------------------
   EXPORT SVG / PNG
------------------------------------------------------- */

function exportSVG() {
  const serializer = new XMLSerializer();
  const svgData = serializer.serializeToString(svg);

  const blob = new Blob([svgData], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "diagram.svg";
  a.click();

  URL.revokeObjectURL(url);
}

function exportPNG() {
  const serializer = new XMLSerializer();
  const svgData = serializer.serializeToString(svg);

  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  const img = new Image();
  img.onload = function () {
    const scale = window.devicePixelRatio || 2;
    const width = svg.clientWidth;
    const height = svg.clientHeight;

    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    // Sfondo coerente con il tema dark
    ctx.fillStyle = "#050509";
    ctx.fillRect(0, 0, width, height);

    ctx.drawImage(img, 0, 0, width, height);

    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "diagram.png";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    URL.revokeObjectURL(url);
  };

  img.onerror = function () {
    alert("Errore nel rendering PNG. Controlla il contenuto SVG.");
    URL.revokeObjectURL(url);
  };

  img.src = url;
}


/* -------------------------------------------------------
   HIT TEST
------------------------------------------------------- */

function hitTestElement(x, y) {
  const d = workspaceState.currentDiagram;
  for (let i = d.elements.length - 1; i >= 0; i--) {
    const el = d.elements[i];
    if (x >= el.x && x <= el.x + el.w && y >= el.y && y <= el.y + el.h) {
      return el;
    }
  }
  return null;
}

function hitTestConnection(x, y) {
  const d = workspaceState.currentDiagram;

  for (let i = d.connections.length - 1; i >= 0; i--) {
    const c = d.connections[i];
    const from = d.elements.find((e) => e.id === c.fromId);
    const to = d.elements.find((e) => e.id === c.toId);
    if (!from || !to) continue;

    const x1 = from.x + from.w / 2;
    const y1 = from.y + from.h / 2;
    const x2 = to.x + to.w / 2;
    const y2 = to.y + to.h / 2;

    const dist = pointLineDistance(x, y, x1, y1, x2, y2);
    if (dist < 6) return c;
  }

  return null;
}

function pointLineDistance(px, py, x1, y1, x2, y2) {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

/* -------------------------------------------------------
   PAN / ZOOM
------------------------------------------------------- */

function applyTransform() {
  const t = `translate(${panState.offsetX}, ${panState.offsetY}) scale(${zoom})`;
  elementsLayer.setAttribute("transform", t);
  connectionsLayer.setAttribute("transform", t);
  commentsLayer.setAttribute("transform", t);
}

zoomSlider.addEventListener("input", () => {
  zoom = zoomSlider.value / 100;
  zoomValue.textContent = `${zoomSlider.value}%`;
  applyTransform();
});

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") spacePressed = true;
});

document.addEventListener("keyup", (e) => {
  if (e.code === "Space") spacePressed = false;
});
/* -------------------------------------------------------
   CANVAS EVENTS (mousedown / mousemove / mouseup)
------------------------------------------------------- */

function clientToSvgPoint(evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const screenCTM = svg.getScreenCTM();
  return pt.matrixTransform(screenCTM.inverse());
}

svg.addEventListener("mousedown", (e) => {
  const pt = clientToSvgPoint(e);
  const x = (pt.x - panState.offsetX) / zoom;
  const y = (pt.y - panState.offsetY) / zoom;

  const el = hitTestElement(x, y);
  const conn = !el ? hitTestConnection(x, y) : null;

  /* ---------------------------------------------
     1) TOOL: ADD COMMENT (priorità assoluta)
  --------------------------------------------- */
  if (currentTool === "add-comment") {
    if (!el && !conn) return;
    openCommentModal(el ? el.id : null, conn ? conn.id : null);
    return;
  }

  /* ---------------------------------------------
     2) TOOL: ADD CLASS / INTERFACE
  --------------------------------------------- */
  if (currentTool === "add-class") {
    addElement("class");
    resetToolButtons();
    currentTool = "select";
    return;
  }

  if (currentTool === "add-interface") {
    addElement("interface");
    resetToolButtons();
    currentTool = "select";
    return;
  }

  /* ---------------------------------------------
     3) TOOL: PAN (o Space + drag)
  --------------------------------------------- */
  if (
    currentTool === "pan" ||
    e.button === 1 ||
    (e.button === 0 && spacePressed)
  ) {
    panState.active = true;
    panState.startX = e.clientX;
    panState.startY = e.clientY;
    return;
  }

  /* ---------------------------------------------
     4) TOOL: CONNECTIONS
  --------------------------------------------- */
  if (
    currentTool === "assoc" ||
    currentTool === "inheritance" ||
    currentTool === "realization" ||
    currentTool === "dependency"
  ) {
    if (el) {
      if (!connectionDraft) {
        connectionDraft = { type: currentTool, fromId: el.id };
      } else {
        if (connectionDraft.fromId !== el.id) {
          addConnection(connectionDraft.type, connectionDraft.fromId, el.id);
          connectionDraft = null;
          resetToolButtons();
          currentTool = "select";
        }
      }
    }
    return;
  }

  /* ---------------------------------------------
     5) TOOL: SELECT
  --------------------------------------------- */
  if (currentTool === "select") {
    if (el) {
      selectedElementId = el.id;
      selectedConnectionId = null;

      dragState = {
        id: el.id,
        startX: x,
        startY: y,
        origX: el.x,
        origY: el.y,
      };
      renderInspector();
      return;
    }

    if (conn) {
      selectedConnectionId = conn.id;
      selectedElementId = null;
      renderInspector();
      return;
    }

    // Click vuoto → deseleziona
    selectedElementId = null;
    selectedConnectionId = null;
    renderInspector();
  }
});

svg.addEventListener("mousemove", (e) => {
  const pt = clientToSvgPoint(e);
  const x = (pt.x - panState.offsetX) / zoom;
  const y = (pt.y - panState.offsetY) / zoom;

  /* PAN */
  if (panState.active) {
    const dx = e.clientX - panState.startX;
    const dy = e.clientY - panState.startY;
    panState.offsetX += dx;
    panState.offsetY += dy;
    panState.startX = e.clientX;
    panState.startY = e.clientY;
    applyTransform();
    return;
  }

  /* DRAG ELEMENT */
  if (dragState) {
    const el = workspaceState.currentDiagram.elements.find(
      (e) => e.id === dragState.id
    );
    if (!el) return;

    const dx = x - dragState.startX;
    const dy = y - dragState.startY;

    el.x = dragState.origX + dx;
    el.y = dragState.origY + dy;

    renderElements();
    renderConnections();
    renderComments();
  }
});

svg.addEventListener("mouseup", () => {
  if (dragState) {
    logActivity("move", `Moved element ${dragState.id}`);
    dragState = null;
    pushHistory();
  }
  panState.active = false;
});

/* -------------------------------------------------------
   TOOL BUTTONS
------------------------------------------------------- */

document.querySelectorAll(".tool-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tool-btn").forEach((b) =>
      b.classList.remove("active")
    );
    btn.classList.add("active");
    currentTool = btn.dataset.tool;
    connectionDraft = null;
  });
});

function resetToolButtons() {
  document.querySelectorAll(".tool-btn").forEach((b) =>
    b.classList.remove("active")
  );
  const selectBtn = document.querySelector('.tool-btn[data-tool="select"]');
  if (selectBtn) selectBtn.classList.add("active");
}

/* -------------------------------------------------------
   COMMENT MODAL
------------------------------------------------------- */

function openCommentModal(targetElementId, targetConnectionId) {
  modalTitleEl.textContent = "Add Comment";
  modalBodyEl.innerHTML = `
    <label>Author</label>
    <input id="commentAuthor" class="input" />
    <label>Text</label>
    <textarea id="commentText" class="input" rows="3"></textarea>
    <label>Severity</label>
    <select id="commentSeverity" class="input">
      <option value="info">Info</option>
      <option value="warn">Warn</option>
      <option value="blocker">Blocker</option>
    </select>
  `;

  modalFooterEl.innerHTML = `
    <button id="commentCancel" class="btn ghost small">Cancel</button>
    <button id="commentSave" class="btn small">Save</button>
  `;

  modalOverlay.classList.remove("hidden");

  document.getElementById("commentCancel").onclick = closeModal;
  document.getElementById("commentSave").onclick = () => {
    const author = document.getElementById("commentAuthor").value.trim();
    const text = document.getElementById("commentText").value.trim();
    const severity = document.getElementById("commentSeverity").value;

    if (!author || !text) {
      alert("Author and text are required.");
      return;
    }

    addComment(targetElementId, targetConnectionId, author, text, severity);
    closeModal();
  };
}

function closeModal() {
  modalOverlay.classList.add("hidden");
}
/* -------------------------------------------------------
   REVIEW MODE + FILTER
------------------------------------------------------- */

reviewModeToggle.addEventListener("click", () => {
  workspaceState.reviewMode = !workspaceState.reviewMode;
  reviewModeToggle.classList.toggle("active", workspaceState.reviewMode);
  render();
});

reviewSeverityFilter.addEventListener("change", () => {
  workspaceState.reviewSeverity = reviewSeverityFilter.value;
  render();
});

/* -------------------------------------------------------
   KEYBOARD SHORTCUTS
------------------------------------------------------- */

document.addEventListener("keydown", (e) => {
  // Delete element/connection
  if (e.key === "Delete") {
    if (selectedElementId) deleteElement(selectedElementId);
    if (selectedConnectionId) deleteConnection(selectedConnectionId);
  }

  // Undo / Redo
  if (e.ctrlKey && e.key === "z") {
    e.preventDefault();
    undo();
  }
  if (e.ctrlKey && e.key === "y") {
    e.preventDefault();
    redo();
  }

  // Export snapshot
  if (e.ctrlKey && e.key === "s") {
    e.preventDefault();
    exportSnapshot();
  }

  // Quick search
  if (e.ctrlKey && e.key === "f") {
    e.preventDefault();
    openQuickSearch();
  }
});

/* -------------------------------------------------------
   QUICK SEARCH
------------------------------------------------------- */

function openQuickSearch() {
  modalTitleEl.textContent = "Quick Search";
  modalBodyEl.innerHTML = `
    <input id="qsInput" class="input" placeholder="Search element by name..." />
    <div id="qsResults" style="margin-top:10px; max-height:200px; overflow:auto;"></div>
  `;
  modalFooterEl.innerHTML = `
    <button class="btn small ghost" id="qsClose">Close</button>
  `;

  modalOverlay.classList.remove("hidden");

  document.getElementById("qsClose").onclick = closeModal;

  const input = document.getElementById("qsInput");
  const results = document.getElementById("qsResults");

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase();
    results.innerHTML = "";

    workspaceState.currentDiagram.elements.forEach((el) => {
      if (el.name.toLowerCase().includes(q)) {
        const div = document.createElement("div");
        div.className = "quickfind-item";
        div.textContent = el.name;
        div.onclick = () => {
          selectedElementId = el.id;
          selectedConnectionId = null;
          closeModal();
          render();
        };
        results.appendChild(div);
      }
    });
  });

  input.focus();
}

/* -------------------------------------------------------
   NEW DIAGRAM
------------------------------------------------------- */

document.getElementById("newDiagramBtn").addEventListener("click", () => {
  if (!confirm("Create a new empty diagram?")) return;
  workspaceState.currentDiagram = createEmptyDiagram();
  selectedElementId = null;
  selectedConnectionId = null;
  render();
});

/* -------------------------------------------------------
   IMPORT SNAPSHOT BUTTON
------------------------------------------------------- */

document.getElementById("importSnapshotBtn").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      importSnapshot(reader.result);
    };
    reader.readAsText(file);
  };

  input.click();
});

/* -------------------------------------------------------
   EXPORT BUTTONS
------------------------------------------------------- */

document.getElementById("exportSnapshotBtn").addEventListener("click", exportSnapshot);
document.getElementById("exportPlantUMLBtn").addEventListener("click", exportPlantUML);
document.getElementById("exportSVGBtn").addEventListener("click", exportSVG);
document.getElementById("exportPNGBtn").addEventListener("click", exportPNG);

/* -------------------------------------------------------
   DIFF BUTTONS
------------------------------------------------------- */

document.getElementById("buildDiffBtn").addEventListener("click", () => {
  renderDiffList();
});

document.getElementById("applyAllDiffBtn").addEventListener("click", () => {
  applyDiff(false);
});

/* -------------------------------------------------------
   DECISION LOG FORM
------------------------------------------------------- */

document.getElementById("decisionForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const title = document.getElementById("decisionTitle").value.trim();
  const reason = document.getElementById("decisionReason").value.trim();
  if (!title || !reason) return;

  workspaceState.currentDiagram.decisionLog.push({
    time: nowIso(),
    author: "User",
    title,
    reason,
  });

  document.getElementById("decisionTitle").value = "";
  document.getElementById("decisionReason").value = "";

  logActivity("decision", `Added decision: ${title}`);
  render();
});

/* -------------------------------------------------------
   WORKSPACE NAME
------------------------------------------------------- */

workspaceNameInput.addEventListener("change", () => {
  workspaceState.workspaceName = workspaceNameInput.value.trim();
  autosave();
});

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */

function init() {
  loadRecentWorkspacesFromStorage();

  // Load demo diagram on first run
  if (!workspaceState.currentDiagram) {
    workspaceState.currentDiagram = createDemoDiagram();
  }

  workspaceNameInput.value = workspaceState.workspaceName;
  render();
}

modalCloseBtn.addEventListener("click", closeModal);

init();
