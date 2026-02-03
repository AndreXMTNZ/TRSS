import { db } from "../firebase-init.js";

import {
  ref, onValue, get, set, update, remove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

/* -------------------- HELPERS -------------------- */
const el = (id) => document.getElementById(id);

function normalize(s) {
  return (s || "").toString().trim().toLowerCase();
}

function avatar(url) {
  return url?.trim() ? url.trim() : "https://i.pravatar.cc/150?img=1";
}

// Construye el label bonito usando lugares
function tripNiceLabel(t, fallback = "") {
  const dir = (t?.directionHint || "").trim();
  const from = (t?.from || "").trim();
  const to = (t?.to || "").trim();

  if (dir && from && to) return `${dir} · ${from} → ${to}`;
  return (t?.label || fallback || "").trim();
}

/* -------------------- ELEMENTS -------------------- */
const defaultTripSelect = el("defaultTrip");

const tbody = el("tbody");
const search = el("search");
const filterActive = el("filterActive");

const modal = el("modal");
const form = el("formPassenger");
const modalTitle = el("modalTitle");

const passengerId = el("passengerId");
const nameI = el("name");
const docI = el("doc");
const codeI = el("code");
const photoURLI = el("photoURL");
const activeI = el("active");

el("btnNew").addEventListener("click", () => openModalNew());
el("btnCancel").addEventListener("click", () => modal.close());

/* -------------------- TRIPS (RUTAS) -------------------- */
let tripsCache = {};

onValue(ref(db, "trips"), (snap) => {
  tripsCache = snap.val() || {};

  defaultTripSelect.innerHTML = `<option value="">— Sin asignar —</option>`;

  Object.entries(tripsCache)
    .filter(([_, t]) => t && t.active)
    .map(([id, t]) => ({ id, label: tripNiceLabel(t, id) }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .forEach(({ id, label }) => {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = label;
      defaultTripSelect.appendChild(opt);
    });
});

/* -------------------- PASSENGERS -------------------- */
let passengersCache = {};

function openModalNew() {
  modalTitle.textContent = "Nuevo pasajero";
  passengerId.value = "";
  nameI.value = "";
  docI.value = "";
  codeI.value = "";
  photoURLI.value = "";
  activeI.value = "true";
  defaultTripSelect.value = ""; // 👈 limpiar ruta por defecto
  modal.showModal();
}

function openModalEdit(id, p) {
  modalTitle.textContent = "Editar pasajero";
  passengerId.value = id;
  nameI.value = p.name || "";
  docI.value = p.doc || "";
  codeI.value = (p.code || "").toUpperCase();
  photoURLI.value = p.photoURL || "";
  activeI.value = String(!!p.active);
  defaultTripSelect.value = p.defaultTrip || "";
  modal.showModal();
}

async function codeExists(code, currentId = null) {
  const snap = await get(ref(db, `codes/${code}`));
  if (!snap.exists()) return false;
  const foundId = snap.val();
  return currentId ? foundId !== currentId : true;
}

function render() {
  const q = normalize(search.value);
  const f = filterActive.value;

  const rows = Object.entries(passengersCache)
    .map(([id, p]) => ({ id, ...p }))
    .filter((p) => {
      if (f === "active" && !p.active) return false;
      if (f === "inactive" && p.active) return false;

      if (!q) return true;
      const hay = normalize(`${p.name} ${p.doc} ${p.code}`);
      return hay.includes(q);
    })
    .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name)));

  tbody.innerHTML = rows.map(p => {
    const badge = p.active
      ? `<span class="badge ok">● Activo</span>`
      : `<span class="badge off">● Inactivo</span>`;

    return `
      <tr>
        <td><img class="avatar" src="${avatar(p.photoURL)}" alt="foto"></td>
        <td>${p.name || ""}</td>
        <td>${p.doc || ""}</td>
        <td><strong>${(p.code || "").toUpperCase()}</strong></td>
        <td>${badge}</td>
        <td>
          <button class="btn sm" data-action="edit" data-id="${p.id}">Editar</button>
          <button class="btn sm" data-action="toggle" data-id="${p.id}">
            ${p.active ? "Desactivar" : "Activar"}
          </button>
          <button class="btn sm danger" data-action="delete" data-id="${p.id}">Eliminar</button>
        </td>
      </tr>
    `;
  }).join("");
}

search.addEventListener("input", render);
filterActive.addEventListener("change", render);

tbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const p = passengersCache[id];
  if (!p) return;

  if (action === "edit") openModalEdit(id, p);

  if (action === "toggle") {
    await update(ref(db, `passengers/${id}`), { active: !p.active });
  }

  if (action === "delete") {
    if (!confirm(`¿Eliminar a "${p.name}"?`)) return;
    if (p.code) await remove(ref(db, `codes/${p.code}`));
    await remove(ref(db, `passengers/${id}`));
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = passengerId.value.trim();

  const payload = {
    name: nameI.value.trim(),
    doc: docI.value.trim(),
    code: codeI.value.trim().toUpperCase(),
    photoURL: photoURLI.value.trim(),
    active: activeI.value === "true",
    defaultTrip: defaultTripSelect.value || null
  };

  if (!payload.name || !payload.doc || !payload.code) {
    alert("Completa nombre, documento y código.");
    return;
  }

  // Validar que el código no choque
  const exists = await codeExists(payload.code, id || null);
  if (exists) {
    alert("Ese código ya existe. Usa otro (ej: iniciales + 4 dígitos).");
    return;
  }

  if (!id) {
    // Crear id simple (demo). En producción se usa push().
    const newId = `p${Date.now()}`;
    payload.createdAt = serverTimestamp();

    await set(ref(db, `passengers/${newId}`), payload);
    await set(ref(db, `codes/${payload.code}`), newId);
  } else {
    // Si cambió el código, actualizar índice
    const oldCode = passengersCache[id]?.code;

    if (oldCode && oldCode !== payload.code) {
      await remove(ref(db, `codes/${oldCode}`));
      await set(ref(db, `codes/${payload.code}`), id);
    } else if (!oldCode) {
      await set(ref(db, `codes/${payload.code}`), id);
    }

    await update(ref(db, `passengers/${id}`), payload);
  }

  modal.close();
});

onValue(ref(db, "passengers"), (snap) => {
  passengersCache = snap.val() || {};
  render();
});
