/**
 * UML Syncboard
 *
 * Estensioni future per Sequence/State più avanzati:
 * - Sequence: aggiungere Actor, Lifeline con attivazioni e messaggi con linee tratteggiate, numerazione passi,
 *   layout verticale automatico e swimlane per lifeline.
 * - State: introdurre regioni, entry/exit/do actions, transizioni con eventi/guard/azione e visualizzazione gerarchica.
 * - Entrambi: riutilizzare il modello Diagram/Elements/Connections, aggiungere renderer specifici e controlli nella palette.
 */

/* -------------------------------------------------------
   CORE STATE
------------------------------------------------------- */

const workspaceState = {
  workspaceName: "Default workspace",
  currentDiagram: null,
  importedSnapshot: null, // per diff/merge
  activityLog: [],
  decisionLog: [],
  comments: [], // separato ma referenziato da diagram.comments
  reviewMode: false,
  reviewSeverity: "all",
  undoStack: [],
  redoStack: [],
  maxHistory: 50,
};

const svg = document.getElementById("diagramCanvas");
const elementsLayer = document.getElementById("elementsLayer");
const connectionsLayer = document.getElementById("connectionsLayer");
const commentsLayer = document.getElementById("commentsLayer");

/* UI refs */
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

/* Modale */
const modalOverlay = document.getElementById("modalOverlay");
const modalTitleEl = document.getElementById("modalTitle");
const modalBodyEl = document.getElementById("modalBody");
const modalFooterEl = document.getElementById("modalFooter");
const modalCloseBtn = document.getElementById("modalCloseBtn");

/* Tools */
let currentTool = "select";
let selectedElementId = null;
let selectedConnectionId = null;
let connectionDraft = null; // { type, fromId }
let dragState = null; // { id, startX, startY, origX, origY }
let panState = { active: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 };
let zoom = 1;

/* -------------------------------------------------------
   MODEL HELPERS
------------------------------------------------------- */

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function nowIso() {
  return new Date().toISOString();
}

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

/* Demo dataset: 6 classi, 8 relazioni, 4 commenti */
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
      text: "Order.getTotal() should probably return a value object instead of number.",
      severity: "info",
      status: "open",
      createdAt: nowIso(),
    },
    {
      commentId: uid(),
      targetElementId: "c_payment",
      targetConnectionId: null,
      author: "Reviewer A",
      text: "PaymentStatus enum missing 'REFUNDED'?",
      severity: "warn",
      status: "open",
      createdAt: nowIso(),
    },
    {
      commentId: uid(),
      targetElementId: null,
      targetConnectionId: "rel_repo_realization",
      author: "Reviewer B",
      text: "Is this actually a realization or just a dependency?",
      severity: "blocker",
      status: "open",
      createdAt: nowIso(),
    },
    {
      commentId: uid(),
      targetElementId: "c_customer",
      targetConnectionId: null,
      author: "Reviewer C",
      text: "Consider adding phoneNumber for contact.",
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
   STORAGE & WORKSPACES
------------------------------------------------------- */

function autosave() {
  if (!workspaceState.currentDiagram) return;
  const key = `umlSyncboard:${workspaceState.workspaceName}`;
  localStorage.setItem(
    key,
    JSON.stringify(workspaceState.currentDiagram)
  );
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
   RENDERING
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

function renderElements() {
  elementsLayer.innerHTML = "";
  const d = workspaceState.currentDiagram;
  const filter = workspaceState.reviewMode;

  d.elements.forEach((el) => {
    if (filter && !elementHasOpenComment(el.id)) return;

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("uml-class");
    if (selectedElementId === el.id) group.classList.add("selected");
    group.setAttribute("data-id", el.id);
    group.setAttribute(
      "transform",
      `translate(${el.x}, ${el.y})`
    );

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("width", el.w);
    rect.setAttribute("height", el.h);
    group.appendChild(rect);

    const nameBg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect"
    );
    nameBg.setAttribute("width", el.w);
    nameBg.setAttribute("height", 24);
    nameBg.setAttribute("class", "class-name-bg");
    group.appendChild(nameBg);

    const nameText = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    nameText.setAttribute("x", 6);
    nameText.setAttribute("y", 16);
    nameText.textContent =
      (el.stereotype ? el.stereotype + " " : "") + el.name;
    nameText.setAttribute("data-role", "name");
    group.appendChild(nameText);

    const attrsText = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    attrsText.setAttribute("x", 6);
    attrsText.setAttribute("y", 38);
    attrsText.innerHTML = "";
    let offset = 0;
    (el.attributes || []).forEach((line) => {
      const tspan = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "tspan"
      );
      tspan.setAttribute("x", 6);
      tspan.setAttribute("dy", offset === 0 ? 0 : 13);
      tspan.textContent = line;
      attrsText.appendChild(tspan);
      offset++;
    });
    group.appendChild(attrsText);

    const methodsText = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text"
    );
    methodsText.setAttribute("x", 6);
    methodsText.setAttribute("y", 38 + (el.attributes || []).length * 13 + 12);
    offset = 0;
    (el.methods || []).forEach((line) => {
      const tspan = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "tspan"
      );
      tspan.setAttribute("x", 6);
      tspan.setAttribute("dy", offset === 0 ? 0 : 13);
      tspan.textContent = line;
      methodsText.appendChild(tspan);
      offset++;
    });
    group.appendChild(methodsText);

    elementsLayer.appendChild(group);
  });
}

function elementHasOpenComment(id) {
  const d = workspaceState.currentDiagram;
  return d.comments.some(
    (c) => c.targetElementId === id && c.status === "open"
  );
}

function renderConnections() {
  connectionsLayer.innerHTML = "";
  const d = workspaceState.currentDiagram;

  d.connections.forEach((c) => {
    const from = d.elements.find((e) => e.id === c.fromId);
    const to = d.elements.find((e) => e.id === c.toId);
    if (!from || !to) return;

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("uml-connection");
    if (c.type === "dependency") group.classList.add("dependency");
    if (selectedConnectionId === c.id) group.classList.add("selected");
    group.setAttribute("data-id", c.id);

    const fromX = from.x + from.w / 2;
    const fromY = from.y + from.h / 2;
    const toX = to.x + to.w / 2;
    const toY = to.y + to.h / 2;

    const line = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );
    line.setAttribute("x1", fromX);
    line.setAttribute("y1", fromY);
    line.setAttribute("x2", toX);
    line.setAttribute("y2", toY);
    group.appendChild(line);

    if (c.label) {
      const labelText = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );
      labelText.setAttribute("x", (fromX + toX) / 2 + 4);
      labelText.setAttribute("y", (fromY + toY) / 2 - 4);
      labelText.setAttribute("fill", "#e5e7ff");
      labelText.setAttribute("font-size", "10");
      labelText.textContent = c.label;
      group.appendChild(labelText);
    }

    connectionsLayer.appendChild(group);
  });
}

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
    const targetPos = getCommentTargetPosition(c);
    if (!targetPos) return;

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    circle.setAttribute("cx", targetPos.x);
    circle.setAttribute("cy", targetPos.y);
    circle.setAttribute("r", 7);
    circle.classList.add("comment-badge", c.severity);
    group.appendChild(circle);
    commentsLayer.appendChild(group);
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
        <textarea id="inspAttrs" class="input" rows="4">${(el.attributes || []).join(
          "\n"
        )}</textarea>
        <label>Methods (one per line)</label>
        <textarea id="inspMethods" class="input" rows="4">${(el.methods || []).join(
          "\n"
        )}</textarea>
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
      c.multiplicityFrom = document
        .getElementById("inspMultFrom")
        .value.trim();
      c.multiplicityTo = document.getElementById("inspMultTo").value.trim();
      logActivity("update", `Updated connection ${c.id}`);
      render();
    };
  } else {
    inspectorContent.classList.add("empty");
    inspectorContent.innerHTML = "<p>No selection</p>";
  }
}

function renderActivityLog() {
  activityLogEl.innerHTML = "";
  const log = workspaceState.currentDiagram.activityLog.slice(-50);
  log.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `[${entry.time}] ${entry.author} - ${entry.actionType}: ${entry.summary}`;
    activityLogEl.appendChild(li);
  });
}

function renderDecisionLog() {
  decisionLogEl.innerHTML = "";
  const log = workspaceState.currentDiagram.decisionLog;
  log.forEach((d) => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="decision-title">${d.title}</div>
      <div class="decision-reason">${d.reason}</div>`;
    decisionLogEl.appendChild(li);
  });
}

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
   ELEMENT / CONNECTION CRUD
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
  logActivity("connect", `Created ${type} between ${fromId} and ${toId}`);
  render();
}

/* -------------------------------------------------------
   COMMENTS
------------------------------------------------------- */

function addComment(targetElementId, targetConnectionId, author, text, severity) {
  pushHistory();
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
  workspaceState.currentDiagram.comments.push(c);
  logActivity("comment", `Comment added (${severity})`);
  render();
}

function resolveComment(commentId) {
  pushHistory();
  const c = workspaceState.currentDiagram.comments.find(
    (c) => c.commentId === commentId
  );
  if (!c) return;
  c.status = "resolved";
  logActivity("resolve", `Comment resolved`);
  render();
}

/* -------------------------------------------------------
   SNAPSHOT EXPORT / IMPORT
------------------------------------------------------- */

function exportSnapshot() {
  const d = workspaceState.currentDiagram;
  const snapshot = {
    diagram: d,
  };
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${d.name.replace(/\s+/g, "_")}_${d.versionLabel}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importSnapshot(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed.diagram) throw new Error("Invalid snapshot");
      workspaceState.importedSnapshot = parsed.diagram;
      openModal("Snapshot imported", "<p>Snapshot loaded for diff/merge.</p>", [
        { label: "Close", class: "btn", action: closeModal },
      ]);
      renderDiffList();
    } catch (e) {
      alert("Invalid JSON snapshot");
    }
  };
  reader.readAsText(file);
}

/* -------------------------------------------------------
   DIFF & MERGE
------------------------------------------------------- */

function buildDiff() {
  const base = workspaceState.currentDiagram;
  const other = workspaceState.importedSnapshot;
  if (!other) return [];

  const diff = [];
  const baseById = Object.fromEntries(base.elements.map((e) => [e.id, e]));
  const otherById = Object.fromEntries(other.elements.map((e) => [e.id, e]));

  // Added / removed / changed elements
  other.elements.forEach((el) => {
    const b = baseById[el.id];
    if (!b) {
      diff.push({
        kind: "element-added",
        targetId: el.id,
        summary: `Element added: ${el.name}`,
        apply: () => {
          base.elements.push(JSON.parse(JSON.stringify(el)));
        },
      });
    } else if (JSON.stringify(el) !== JSON.stringify(b)) {
      diff.push({
        kind: "element-modified",
        targetId: el.id,
        summary: `Element modified: ${el.name}`,
        conflict: true,
        baseValue: b,
        otherValue: el,
        apply: (useOther) => {
          const idx = base.elements.findIndex((x) => x.id === el.id);
          if (idx >= 0) {
            base.elements[idx] = JSON.parse(
              JSON.stringify(useOther ? other.elements[idx] || el : b)
            );
          }
        },
      });
    }
  });

  base.elements.forEach((el) => {
    if (!otherById[el.id]) {
      diff.push({
        kind: "element-removed",
        targetId: el.id,
        summary: `Element removed: ${el.name}`,
        apply: () => {
          base.elements = base.elements.filter((e) => e.id !== el.id);
        },
      });
    }
  });

  // Connections simple diff
  const baseConnIds = new Set(base.connections.map((c) => c.id));
  const otherConnIds = new Set(other.connections.map((c) => c.id));

  other.connections.forEach((c) => {
    if (!baseConnIds.has(c.id)) {
      diff.push({
        kind: "connection-added",
        targetId: c.id,
        summary: `Connection added: ${c.type}`,
        apply: () => base.connections.push(JSON.parse(JSON.stringify(c))),
      });
    }
  });

  base.connections.forEach((c) => {
    if (!otherConnIds.has(c.id)) {
      diff.push({
        kind: "connection-removed",
        targetId: c.id,
        summary: `Connection removed: ${c.type}`,
        apply: () => {
          base.connections = base.connections.filter((x) => x.id !== c.id);
        },
      });
    }
  });

  // Comments new/resolved
  const baseCommentsById = Object.fromEntries(
    base.comments.map((c) => [c.commentId, c])
  );
  const otherCommentsById = Object.fromEntries(
    other.comments.map((c) => [c.commentId, c])
  );

  other.comments.forEach((c) => {
    const b = baseCommentsById[c.commentId];
    if (!b) {
      diff.push({
        kind: "comment-added",
        targetId: c.commentId,
        summary: `Comment added (${c.severity})`,
        apply: () => base.comments.push(JSON.parse(JSON.stringify(c))),
      });
    } else if (b.status !== c.status) {
      diff.push({
        kind: "comment-status",
        targetId: c.commentId,
        summary: `Comment status change: ${b.status} -> ${c.status}`,
        apply: () => {
          b.status = c.status;
        },
      });
    }
  });

  return diff;
}

function applyDiff(applyAll = false) {
  if (!workspaceState.importedSnapshot) return;
  const diff = buildDiff();
  const checkboxes = diffListEl.querySelectorAll("input[type=checkbox]");
  diff.forEach((item, index) => {
    const cb = checkboxes[index];
    if (!cb && !applyAll) return;
    if (!applyAll && !cb.checked) return;

    if (item.conflict) {
      // Simple conflict resolution: ask once per item
      const useOther = confirm(
        `Conflict for ${item.summary}. OK = use imported version, Cancel = keep local`
      );
      item.apply(useOther);
    } else if (item.apply) {
      item.apply(true);
    }
  });
  logActivity("update", "Diff applied");
  render();
}

/* -------------------------------------------------------
   PLANTUML EXPORT (CLASS DIAGRAM)
------------------------------------------------------- */

function exportPlantUML() {
  const d = workspaceState.currentDiagram;
  const lines = ["@startuml"];

  d.elements.forEach((el) => {
    if (el.kind === "interface") {
      lines.push(`interface ${el.name} {`);
    } else {
      lines.push(`class ${el.name} {`);
    }
    (el.attributes || []).forEach((a) => lines.push(`  ${a}`));
    if (el.methods && el.methods.length) lines.push("--");
    (el.methods || []).forEach((m) => lines.push(`  ${m}`));
    lines.push("}");
  });

  d.connections.forEach((c) => {
    const from = d.elements.find((e) => e.id === c.fromId);
    const to = d.elements.find((e) => e.id === c.toId);
    if (!from || !to) return;
    let arrow = "--";
    if (c.type === "inheritance") arrow = " --|> ";
    else if (c.type === "realization") arrow = " ..|> ";
    else if (c.type === "dependency") arrow = " ..> ";
    else arrow = " -- ";
    let rel = `${from.name}${arrow}${to.name}`;
    if (c.label) rel += ` : ${c.label}`;
    lines.push(rel);
  });

  lines.push("@enduml");
  const text = lines.join("\n");
  navigator.clipboard.writeText(text).then(() => {
    openModal(
      "PlantUML copied",
      "<p>PlantUML representation copied to clipboard.</p>",
      [{ label: "Close", class: "btn", action: closeModal }]
    );
  });
}

/* -------------------------------------------------------
   EXPORT SVG / PNG
------------------------------------------------------- */

function exportSVG() {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "diagram.svg";
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportPNG() {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svg);
  const img = new Image();
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  img.onload = function () {
    const canvas = document.createElement("canvas");
    canvas.width = svg.clientWidth * 2;
    canvas.height = svg.clientHeight * 2;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#050816";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);

    canvas.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "diagram.png";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };
  img.src = url;
}

/* -------------------------------------------------------
   MODAL
------------------------------------------------------- */

function openModal(title, bodyHTML, actions = []) {
  modalTitleEl.textContent = title;
  modalBodyEl.innerHTML = bodyHTML;
  modalFooterEl.innerHTML = "";
  actions.forEach((a) => {
    const btn = document.createElement("button");
    btn.textContent = a.label;
    btn.className = a.class || "btn";
    btn.addEventListener("click", a.action);
    modalFooterEl.appendChild(btn);
  });
  modalOverlay.classList.remove("hidden");
}

function closeModal() {
  modalOverlay.classList.add("hidden");
}

/* -------------------------------------------------------
   HIT TEST & INTERACTION
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
  const threshold = 8;
  for (const c of d.connections) {
    const from = d.elements.find((e) => e.id === c.fromId);
    const to = d.elements.find((e) => e.id === c.toId);
    if (!from || !to) continue;
    const x1 = from.x + from.w / 2;
    const y1 = from.y + from.h / 2;
    const x2 = to.x + to.w / 2;
    const y2 = to.y + to.h / 2;
    const dist = pointLineDistance(x, y, x1, y1, x2, y2);
    if (dist < threshold) return c;
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
   MOUSE HANDLERS
------------------------------------------------------- */

svg.addEventListener("mousedown", (e) => {
  const pt = clientToSvgPoint(e);
  if (currentTool === "pan" || (e.button === 1 || (e.button === 0 && e.spaceKey))) {
    panState.active = true;
    panState.startX = e.clientX;
    panState.startY = e.clientY;
    return;
  }

  const el = hitTestElement(pt.x, pt.y);
  const conn = !el ? hitTestConnection(pt.x, pt.y) : null;

  if (currentTool === "select") {
    if (el) {
      selectedElementId = el.id;
      selectedConnectionId = null;
      dragState = {
        id: el.id,
        startX: pt.x,
        startY: pt.y,
        origX: el.x,
        origY: el.y,
      };
    } else if (conn) {
      selectedConnectionId = conn.id;
      selectedElementId = null;
    } else {
      selectedElementId = null;
      selectedConnectionId = null;
    }
    renderInspector();
    renderElements();
    renderConnections();
  } else if (
    currentTool === "assoc" ||
    currentTool === "inheritance" ||
    currentTool === "realization" ||
    currentTool === "dependency"
  ) {
    if (el) {
      if (!connectionDraft) {
        connectionDraft = { type: currentToolToConnectionType(), fromId: el.id };
      } else {
        if (connectionDraft.fromId !== el.id) {
          addConnection(connectionDraft.type, connectionDraft.fromId, el.id);
          connectionDraft = null;
        }
      }
    }
  } else if (currentTool === "add-comment") {
    if (!el && !conn) return;
    openCommentModal(el ? el.id : null, conn ? conn.id : null);
  }
});

svg.addEventListener("mousemove", (e) => {
  if (panState.active) {
    const dx = e.clientX - panState.startX;
    const dy = e.clientY - panState.startY;
    panState.offsetX += dx;
    panState.offsetY += dy;
    panState.startX = e.clientX;
    panState.startY = e.clientY;
    updateSvgTransform();
    return;
  }

  if (dragState) {
    const pt = clientToSvgPoint(e);
    const el = workspaceState.currentDiagram.elements.find(
      (e) => e.id === dragState.id
    );
    if (!el) return;
    const dx = pt.x - dragState.startX;
    const dy = pt.y - dragState.startY;
    el.x = Math.round((dragState.origX + dx) / 10) * 10;
    el.y = Math.round((dragState.origY + dy) / 10) * 10;
    renderElements();
    renderConnections();
  }
});

svg.addEventListener("mouseup", () => {
  if (dragState) {
    pushHistory();
    logActivity("move", "Element moved");
  }
  dragState = null;
  panState.active = false;
});

/* Inline rename on double click */
svg.addEventListener("dblclick", (e) => {
  const pt = clientToSvgPoint(e);
  const el = hitTestElement(pt.x, pt.y);
  if (!el) return;
  const newName = prompt("Rename element", el.name);
  if (newName && newName.trim()) {
    updateElement(el.id, { name: newName.trim() });
  }
});

function clientToSvgPoint(e) {
  const rect = svg.getBoundingClientRect();
  const x = (e.clientX - rect.left - panState.offsetX) / zoom;
  const y = (e.clientY - rect.top - panState.offsetY) / zoom;
  return { x, y };
}

/* SVG transform for pan & zoom */
function updateSvgTransform() {
  const t = `translate(${panState.offsetX},${panState.offsetY}) scale(${zoom})`;
  elementsLayer.setAttribute("transform", t);
  connectionsLayer.setAttribute("transform", t);
  commentsLayer.setAttribute("transform", t);
}

/* -------------------------------------------------------
   COMMENT MODAL
------------------------------------------------------- */

function openCommentModal(targetElementId, targetConnectionId) {
  const body = `
    <label class="label-small">Author</label>
    <input id="commentAuthor" class="input" value="Reviewer" />
    <label class="label-small">Severity</label>
    <select id="commentSeverity" class="input">
      <option value="info">Info</option>
      <option value="warn">Warn</option>
      <option value="blocker">Blocker</option>
    </select>
    <label class="label-small">Text</label>
    <textarea id="commentText" class="input" rows="3"></textarea>
  `;
  openModal("Add Comment", body, [
    {
      label: "Cancel",
      class: "btn ghost",
      action: closeModal,
    },
    {
      label: "Add",
      class: "btn",
      action: () => {
        const author = document.getElementById("commentAuthor").value.trim();
        const severity = document.getElementById("commentSeverity").value;
        const text = document.getElementById("commentText").value.trim();
        if (!text) return;
        addComment(targetElementId, targetConnectionId, author || "Reviewer", text, severity);
        closeModal();
      },
    },
  ]);
}

/* -------------------------------------------------------
   TOOL SWITCHING
------------------------------------------------------- */

document.querySelectorAll(".tool-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tool-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentTool = btn.dataset.tool;
    connectionDraft = null;
  });
});

function currentToolToConnectionType() {
  switch (currentTool) {
    case "assoc":
      return "association";
    case "inheritance":
      return "inheritance";
    case "realization":
      return "realization";
    case "dependency":
      return "dependency";
    default:
      return "association";
  }
}

/* -------------------------------------------------------
   UI CONTROLS & SHORTCUTS
------------------------------------------------------- */

/* New Diagram */
document.getElementById("newDiagramBtn").addEventListener("click", () => {
  if (!confirm("Start a new empty diagram? Current changes will be lost.")) return;
  workspaceState.currentDiagram = createEmptyDiagram();
  pushHistory();
  render();
});

/* Recent button: just opens modal listing what is already in sidebar */
document.getElementById("recentWorkspacesBtn").addEventListener("click", () => {
  const raw = localStorage.getItem("umlSyncboard:recent");
  const list = raw ? JSON.parse(raw) : [];
  const body = list.length
    ? `<ul>${list.map((n) => `<li>${n}</li>`).join("")}</ul>`
    : "<p>No recent workspaces</p>";
  openModal("Recent Workspaces", body, [
    { label: "Close", class: "btn", action: closeModal },
  ]);
});

/* Snapshot export/import */
document.getElementById("exportSnapshotBtn").addEventListener("click", exportSnapshot);

document.getElementById("importSnapshotBtn").addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = () => {
    const file = input.files[0];
    if (file) importSnapshot(file);
  };
  input.click();
});

/* Diff build / apply */
document.getElementById("buildDiffBtn").addEventListener("click", () => {
  if (!workspaceState.importedSnapshot) {
    openModal("No snapshot", "<p>Import a snapshot first.</p>", [
      { label: "Close", class: "btn", action: closeModal },
    ]);
    return;
  }
  renderDiffList();
});

document.getElementById("applyAllDiffBtn").addEventListener("click", () => {
  if (!workspaceState.importedSnapshot) return;
  pushHistory();
  applyDiff(true);
});

/* Decision log */
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
  logActivity("update", "Decision added");
  renderDecisionLog();
});

/* Workspace name */
workspaceNameInput.addEventListener("change", () => {
  workspaceState.workspaceName = workspaceNameInput.value || "Default workspace";
  autosave();
});

/* Review mode */
reviewModeToggle.addEventListener("click", () => {
  workspaceState.reviewMode = !workspaceState.reviewMode;
  reviewModeToggle.classList.toggle("active", workspaceState.reviewMode);
  render();
});

reviewSeverityFilter.addEventListener("change", () => {
  workspaceState.reviewSeverity = reviewSeverityFilter.value;
  renderComments();
  renderElements();
});

/* PlantUML, SVG, PNG */
document.getElementById("exportPlantUMLBtn").addEventListener("click", exportPlantUML);
document.getElementById("exportSVGBtn").addEventListener("click", exportSVG);
document.getElementById("exportPNGBtn").addEventListener("click", exportPNG);

/* Zoom slider */
zoomSlider.addEventListener("input", () => {
  zoom = Number(zoomSlider.value) / 100;
  zoomValue.textContent = `${zoomSlider.value}%`;
  updateSvgTransform();
});

/* Quick search */
document.getElementById("quickSearchBtn").addEventListener("click", openQuickSearchModal);

function openQuickSearchModal() {
  const d = workspaceState.currentDiagram;
  let body = `
    <input id="quickSearchInput" class="input" placeholder="Search by name..." />
    <div id="quickSearchResults" style="margin-top:6px; max-height:160px; overflow:auto;"></div>
  `;
  openModal("Quick Search", body, [
    { label: "Close", class: "btn", action: closeModal },
  ]);

  const input = document.getElementById("quickSearchInput");
  const results = document.getElementById("quickSearchResults");

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase();
    results.innerHTML = "";
    d.elements
      .filter((el) => el.name.toLowerCase().includes(q))
      .forEach((el) => {
        const div = document.createElement("div");
        div.className = "quickfind-item";
        div.textContent = el.name;
        div.addEventListener("click", () => {
          selectedElementId = el.id;
          selectedConnectionId = null;
          render();
          closeModal();
        });
        results.appendChild(div);
      });
  });
  input.focus();
}

/* Shortcuts */
document.addEventListener("keydown", (e) => {
  if (e.key === "Delete" && selectedElementId) {
    e.preventDefault();
    deleteElement(selectedElementId);
  } else if (e.key.toLowerCase() === "s" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    exportSnapshot();
  } else if (e.key.toLowerCase() === "f" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    openQuickSearchModal();
  } else if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (e.key.toLowerCase() === "y" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    redo();
  } else if (e.code === "Space") {
    e.preventDefault();
    // aid for pan: mark flag used in mousedown
    e.spaceKey = true;
  }
});

/* Modal close */
modalCloseBtn.addEventListener("click", closeModal);

/* -------------------------------------------------------
   INIT
------------------------------------------------------- */

function init() {
  // Try load default workspace, else demo
  workspaceNameInput.value = workspaceState.workspaceName;
  const key = `umlSyncboard:${workspaceState.workspaceName}`;
  const raw = localStorage.getItem(key);
  if (raw) {
    workspaceState.currentDiagram = JSON.parse(raw);
  } else {
    workspaceState.currentDiagram = createDemoDiagram();
    pushHistory();
  }
  loadRecentWorkspacesFromStorage();
  zoom = 1;
  updateSvgTransform();
  render();
}

init();
