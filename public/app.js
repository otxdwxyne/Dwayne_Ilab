const $ = (id) => document.getElementById(id);
let counties = [];
let currentPage = 1;
let pages = 1;
let searchDebounce;
const escapeHTML = (v = "") => String(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function clubCard(club, index) {
  const email = club.publicEmail;
  const phone = club.publicPhone;
  let contact = "";
  if (email) contact = `<a class="contact" href="mailto:${escapeHTML(email)}">Contact club ↗</a>`;
  else if (phone) contact = `<a class="contact" href="tel:${escapeHTML(phone.replace(/[^\d+]/g,""))}">Contact club ↗</a>`;
  else contact = `<span class="contact">Contact details unavailable</span>`;
  return `<article class="club-card"><div class="club-art"><span class="ball-icon">⚽</span><span class="county-label">${escapeHTML(club.county)}</span></div><div class="club-body">${club.featured ? '<span class="club-feature">✳ COMMUNITY SPOTLIGHT</span>' : '<span class="club-feature">GRASSROOTS FOOTBALL</span>'}<h3>${escapeHTML(club.name)}</h3><div class="club-loc">⌖ ${escapeHTML(club.town)}, ${escapeHTML(club.county)}</div><p>${escapeHTML(club.description)}</p><div class="club-meta"><span class="age-pill">${escapeHTML(club.ageGroups || "Ask club for ages")}</span>${contact}</div></div></article>`;
}
async function loadMeta() {
  try {
    const response = await fetch("/api/meta");
    if (!response.ok) throw new Error("meta");
    const data = await response.json();
    counties = data.counties || [];
    for (const county of counties) {
      const a = document.createElement("option"); a.value = county; a.textContent = county; $("county").appendChild(a);
      const b = a.cloneNode(true); $("countyFilter").appendChild(b);
    }
  } catch {
    $("resultCount").textContent = "Could not load counties";
  }
}
function filters() {
  return new URLSearchParams({
    q: $("search").value.trim(),
    county: $("countyFilter").value,
    ageGroup: $("ageFilter").value,
    page: String(currentPage)
  });
}
async function loadClubs() {
  $("clubGrid").innerHTML = '<div class="loading">Finding clubs around Kenya…</div>';
  try {
    const response = await fetch("/api/clubs?" + filters().toString());
    if (!response.ok) throw new Error("Directory unavailable");
    const data = await response.json();
    pages = data.pages || 1;
    $("clubGrid").innerHTML = data.clubs.map(clubCard).join("");
    $("clubCount").textContent = data.total;
    $("resultCount").textContent = `${data.total} ${data.total === 1 ? "club" : "clubs"} found`;
    $("noResults").classList.toggle("hidden", data.total !== 0);
    renderPagination();
  } catch {
    $("clubGrid").innerHTML = '<div class="loading">We could not reach the directory. Please refresh in a moment.</div>';
    $("resultCount").textContent = "Directory unavailable";
    $("noResults").classList.add("hidden");
  }
}
function renderPagination() {
  const root = $("pagination");
  root.innerHTML = "";
  if (pages <= 1) return;
  const prev = document.createElement("button");
  prev.className = "page-btn"; prev.textContent = "←"; prev.disabled = currentPage === 1;
  prev.setAttribute("aria-label","Previous page");
  prev.onclick = () => { currentPage--; loadClubs(); };
  root.appendChild(prev);
  for (let p = 1; p <= pages; p++) {
    const btn = document.createElement("button");
    btn.className = "page-btn" + (p === currentPage ? " active" : "");
    btn.textContent = String(p); btn.setAttribute("aria-label",`Page ${p}`);
    if (p === currentPage) btn.setAttribute("aria-current","page");
    btn.onclick = () => { currentPage = p; loadClubs(); };
    root.appendChild(btn);
  }
  const next = document.createElement("button");
  next.className = "page-btn"; next.textContent = "→"; next.disabled = currentPage === pages;
  next.setAttribute("aria-label","Next page");
  next.onclick = () => { currentPage++; loadClubs(); };
  root.appendChild(next);
}
function queueSearch() {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { currentPage = 1; loadClubs(); }, 250);
}
$("search").addEventListener("input", queueSearch);
$("countyFilter").addEventListener("change", () => { currentPage = 1; loadClubs(); });
$("ageFilter").addEventListener("change", () => { currentPage = 1; loadClubs(); });
$("registerForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const message = $("formMessage");
  const fd = new FormData(form);
  const payload = Object.fromEntries(fd.entries());
  payload.consent = fd.get("consent") === "on";
  // Honeypot value is never sent as a public field.
  if (payload.websiteTrap) {
    message.className = "message success"; message.textContent = "Thanks. Your submission has been received."; form.reset(); return;
  }
  delete payload.websiteTrap;
  button.disabled = true; button.textContent = "Sending for review…";
  message.className = "message"; message.textContent = "";
  try {
    const response = await fetch("/api/clubs", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) {
      const detail = data.details?.map(x => x.message).join(" ") || data.error || "Please check the form and try again.";
      throw new Error(detail);
    }
    message.className = "message success";
    message.textContent = data.message + (data.reference ? ` Reference: ${data.reference}` : "");
    form.reset();
  } catch (error) {
    message.className = "message error";
    message.textContent = error.message || "Could not submit. Please try again.";
  } finally {
    button.disabled = false;
    button.innerHTML = 'Send for review <b>↗</b>';
  }
});
$("menuButton").addEventListener("click", () => $("navLinks").classList.toggle("open"));
document.querySelectorAll("#navLinks a").forEach(a => a.addEventListener("click", () => $("navLinks").classList.remove("open")));
$("year").textContent = new Date().getFullYear();
(async () => { await loadMeta(); await loadClubs(); })();