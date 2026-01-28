import { db } from "../firebase-init.js";

import {
  ref, onValue, get, push, set, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const el = (id) => document.getElementById(id);

const codeInput = el("code");
const directionSelect = el("direction");
const btnRegister = el("btnRegister");
const preview = el("preview");
const statusEl = el("status");
const listEl = el("list");
const todayLabel = el("todayLabel");

let passengersCache = {};

function dateKey(d = new Date()) {
  // YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function avatar(url) {
  return url?.trim() ? url.trim() : "https://i.pravatar.cc/150?img=1";
}

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function showPreview(p) {
  preview.classList.remove("hidden");
  preview.innerHTML = `
    <img class="avatar" src="${avatar(p.photoURL)}" alt="foto">
    <div>
      <h3>${p.name || ""} <span class="tag">${p.code || ""}</span></h3>
      <p>Doc: ${p.doc || ""} · Estado: ${p.active ? "Activo" : "Inactivo"}</p>
    </div>
  `;
}

function hidePreview() {
  preview.classList.add("hidden");
  preview.innerHTML = "";
}

async function findPassengerByCode(code) {
  const codeNorm = code.trim().toUpperCase();
  if (!codeNorm) return null;

  const snap = await get(ref(db, `codes/${codeNorm}`));
  if (!snap.exists()) return null;

  const pid = snap.val();
  const psnap = await get(ref(db, `passengers/${pid}`));
  if (!psnap.exists()) return null;

  return { id: pid, ...psnap.val() };
}

btnRegister.addEventListener("click", async () => {
  const code = codeInput.value.trim().toUpperCase();
  const direction = directionSelect.value;

  if (!code) {
    setStatus("Ingresa un código.");
    return;
  }

  setStatus("Buscando pasajero...");
  hidePreview();

  const passenger = await findPassengerByCode(code);

  if (!passenger) {
    setStatus("Código no encontrado.");
    return;
  }

  showPreview(passenger);

  if (!passenger.active) {
    setStatus("Este pasajero está INACTIVO. No se registró.");
    return;
  }

  // Registrar asistencia
  const day = dateKey(new Date());
  const recordRef = push(ref(db, `attendance/${day}`));

  await set(recordRef, {
    passengerId: passenger.id,
    code: passenger.code,
    direction,
    timestamp: serverTimestamp()
  });

  setStatus(`Registrado: ${passenger.name} (${direction})`);
  codeInput.value = "";
  codeInput.focus();
});

// Cargar cache de pasajeros para pintar nombres en la lista
onValue(ref(db, "passengers"), (snap) => {
  passengersCache = snap.val() || {};
});

// Lista registros del día en tiempo real
const today = dateKey(new Date());
todayLabel.textContent = today;

onValue(ref(db, `attendance/${today}`), (snap) => {
  const data = snap.val() || {};
  const rows = Object.entries(data)
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  if (!rows.length) {
    listEl.innerHTML = `<div class="muted">Aún no hay registros hoy.</div>`;
    return;
  }

  listEl.innerHTML = rows.map(r => {
    const p = passengersCache[r.passengerId] || {};
    const name = p.name || "(Sin nombre)";
    const when = r.timestamp ? new Date(r.timestamp).toLocaleString() : "—";
    return `
      <div class="item">
        <div class="itemLeft">
          <img class="avatar" src="${avatar(p.photoURL)}" alt="foto">
          <div>
            <strong>${name}</strong>
            <small>${r.code || ""} · ${when}</small>
          </div>
        </div>
        <span class="tag">${r.direction || ""}</span>
      </div>
    `;
  }).join("");
});
