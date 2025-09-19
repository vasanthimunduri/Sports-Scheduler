// Helper: show alert messages
function showMessage(msg, type = "info") {
  alert(`${type.toUpperCase()}: ${msg}`);
}

// ----------------------
// AUTH UTIL
// ----------------------
function getCurrentUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCurrentUser(user) {
  localStorage.setItem("user", JSON.stringify(user));
}

function authHeaders() {
  const user = getCurrentUser();
  return user ? { "x-user-id": user.id } : {};
}

// ----------------------
// REGISTER FORM
// ----------------------
const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(registerForm);
    const user = {
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      role: formData.get("role")
    };

    try {
      const res = await fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user)
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        showMessage("Registration successful!", "success");
        window.location.href = "dashboard.html";
      } else {
        showMessage("Registration failed. Try again!", "error");
      }
    } catch (err) {
      showMessage("Server error: " + err.message, "error");
    }
  });
}

// ----------------------
// LOGIN FORM
// ----------------------
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(loginForm);
    const user = {
      email: formData.get("email"),
      password: formData.get("password")
    };

    try {
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user)
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        showMessage("Login successful!", "success");
        window.location.href = "dashboard.html";
      } else {
        showMessage("Invalid credentials!", "error");
      }
    } catch (err) {
      showMessage("Server error: " + err.message, "error");
    }
  });
}

// ----------------------
// CREATE SPORT FORM
// ----------------------
const sportForm = document.getElementById("sportForm");
if (sportForm) {
  sportForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(sportForm);
    const sport = { name: formData.get("sportName") };

    try {
      const res = await fetch("/sports", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(sport)
      });

      if (res.ok) {
        showMessage("Sport created successfully!", "success");
        sportForm.reset();
      } else {
        showMessage("Failed to create sport.", "error");
      }
    } catch (err) {
      showMessage("Server error: " + err.message, "error");
    }
  });
}

// ----------------------
// CREATE SESSION FORM
// ----------------------
const sessionForm = document.getElementById("sessionForm");
if (sessionForm) {
  sessionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) {
      showMessage("Please login first", "error");
      window.location.href = "login.html";
      return;
    }
    const formData = new FormData(sessionForm);
    const session = {
      sport: formData.get("sport"),
      date: formData.get("date"),
      time: formData.get("time"),
      venue: formData.get("venue"),
      players: formData.get("players"),
      neededPlayers: formData.get("neededPlayers")
    };

    try {
      const res = await fetch("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(session)
      });

      if (res.ok) {
        showMessage("Session created successfully!", "success");
        window.location.href = "dashboard.html";
      } else {
        const data = await res.json().catch(() => ({}));
        showMessage("Failed to create session: " + (data.error || res.statusText), "error");
      }
    } catch (err) {
      showMessage("Server error: " + err.message, "error");
    }
  });
}

// ----------------------
// DASHBOARD (fetch sessions)
// ----------------------
async function loadDashboard() {
  const created = document.getElementById("createdSessions");
  const joined = document.getElementById("joinedSessions");
  const available = document.getElementById("availableSessions");

  if (created && joined && available) {
    try {
      const user = getCurrentUser();
      if (!user) {
        showMessage("Please login to view your dashboard", "error");
        window.location.href = "login.html";
        return;
      }
      const res = await fetch("/sessions", { headers: { ...authHeaders() } });
      if (res.ok) {
        const data = await res.json();

        const user = getCurrentUser();
        const isAdmin = !!user?.isAdmin;

        created.innerHTML = data.created.length
          ? data.created.map(s => `<li>${s.sport} - ${s.date} @ ${s.time} @ ${s.venue} ${s.initialPlayers && s.initialPlayers.length ? `<span class=\"tag\">With: ${s.initialPlayers.join(' / ')}</span>` : ''} ${s.cancelled ? `(Cancelled: ${s.cancelReason || ''})` : `<span class=\"tag\">Pending: ${s.pendingCount || 0}</span> <button class=\"btn-danger\" onclick=\"cancelSession('${s.id}')\">Cancel</button>`}</li>`).join("")
          : "<li>No sessions created.</li>";

        // If admin, fetch pending details per session to render approve/reject
        if (data.created.length) {
          const container = document.getElementById('pendingRequests');
          container.innerHTML = '';
          for (const s of data.created) {
            const block = document.createElement('div');
            block.style.marginTop = '0.5rem';
            const joined = (s.joinedPlayers || []).map(p => `<li>${p.name || p.email || 'Unknown'} <span class=\"tag\">${p.email || ''}</span></li>`).join('') || '<li>No players joined yet.</li>';
            block.innerHTML = `<strong>${s.sport} (${s.date})</strong> - Joined: ${s.joinedCount} / ${s.neededPlayers + s.joinedCount}
              <div><ul>${joined}</ul></div>
              <div id=\"pending-${s.id}\"><span class=\"tag\">Pending: ${s.pendingCount}</span></div>`;
            container.appendChild(block);

            if (s.pendingCount > 0) {
              // Load pending details and render approve/reject per user
              try {
                const pres = await fetch(`/sessions/${s.id}/pending`, { headers: { ...authHeaders() } });
                if (pres.ok) {
                  const pdata = await pres.json();
                  const host = document.getElementById(`pending-${s.id}`);
                  const items = pdata.pending.map(p => `<li>${p.name || p.email || 'Unknown'} <button class=\"btn\" onclick=\"approve('${s.id}','${p.id}')\">Approve</button> <button class=\"btn-secondary\" onclick=\"reject('${s.id}','${p.id}')\">Reject</button></li>`).join('');
                  host.innerHTML = `<div><strong>Pending Requests</strong><ul>${items}</ul></div>`;
                }
              } catch (e) {}
            }
          }
        }

        joined.innerHTML = data.joined.length
          ? data.joined.map(s => `<li>${s.sport} - ${s.date} @ ${s.venue} <span class=\"tag\">Joined</span> <span class=\"list-actions\"><button class=\"btn-secondary\" onclick=\"leaveSession('${s.id}')\">Leave</button></span></li>`).join("")
          : "<li>No sessions joined.</li>";

        available.innerHTML = data.available.length
          ? data.available.map(s => `<li>${s.sport} - ${s.date} @ ${s.venue} <span class=\"tag\">Open</span> <span class=\"list-actions\"><button class=\"btn\" onclick=\"joinSession('${s.id}')\">Request to Join</button></span></li>`).join("")
          : "<li>No available sessions.</li>";
      } else {
        const data = await res.json().catch(() => ({}));
        showMessage("Failed to load sessions: " + (data.error || res.statusText), "error");
      }
    } catch (err) {
      showMessage("Error loading dashboard: " + err.message, "error");
    }
  }
}
loadDashboard();

// Join session
async function joinSession(id) {
  try {
    const res = await fetch(`/sessions/join/${id}`, { method: "POST", headers: { ...authHeaders() } });
    if (res.ok) {
      showMessage("Request sent to admin.", "success");
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      showMessage("Failed to request: " + (data.error || ''), "error");
    }
  } catch (err) {
    showMessage("Server error: " + err.message, "error");
  }
}

// Populate sports select
async function populateSports() {
  const select = document.querySelector('select[name="sport"]');
  if (!select) return;
  try {
    const res = await fetch('/sports', { headers: { ...authHeaders() } });
    if (!res.ok) return;
    const sports = await res.json();
    // Keep existing placeholder option
    for (const s of sports) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    }
  } catch (err) {
    // Ignore silently
  }
}
populateSports();

// Cancel session
async function cancelSession(id) {
  const reason = prompt('Reason for cancellation?');
  if (reason == null) return;
  try {
    const res = await fetch(`/sessions/${id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ reason }) });
    if (res.ok) {
      showMessage('Session cancelled', 'success');
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      showMessage('Failed to cancel session: ' + (data.error || ''), 'error');
    }
  } catch (err) {
    showMessage('Server error: ' + err.message, 'error');
  }
}

// Leave session
async function leaveSession(id) {
  try {
    const res = await fetch(`/sessions/leave/${id}`, { method: 'POST', headers: { ...authHeaders() } });
    if (res.ok) {
      showMessage('Left session', 'success');
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      showMessage('Failed to leave: ' + (data.error || ''), 'error');
    }
  } catch (err) {
    showMessage('Server error: ' + err.message, 'error');
  }
}

// Approve/Reject all (since we don't show names yet)
async function approveAll(sessionId) {
  try {
    // Call approve with playerId omitted is not supported; this is a demo placeholder
    alert('Approve all pending is a placeholder. For full names/IDs, we would add a pending list API and iterate.');
  } catch (err) {}
}

async function rejectAll(sessionId) {
  try {
    alert('Reject all pending is a placeholder.');
  } catch (err) {}
}

async function approve(sessionId, playerId) {
  try {
    const res = await fetch(`/sessions/${sessionId}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ playerId }) });
    if (res.ok) {
      showMessage('Approved', 'success');
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      showMessage('Failed to approve: ' + (data.error || ''), 'error');
    }
  } catch (err) {
    showMessage('Server error: ' + err.message, 'error');
  }
}

async function reject(sessionId, playerId) {
  try {
    const res = await fetch(`/sessions/${sessionId}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ playerId }) });
    if (res.ok) {
      showMessage('Rejected', 'success');
      window.location.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      showMessage('Failed to reject: ' + (data.error || ''), 'error');
    }
  } catch (err) {
    showMessage('Server error: ' + err.message, 'error');
  }
}

// ----------------------
// REPORT PAGE
// ----------------------
async function loadReports() {
  const sessionReport = document.getElementById("sessionReport");
  const popularityReport = document.getElementById("popularityReport");

  if (sessionReport && popularityReport) {
    try {
      const res = await fetch("/reports", { headers: { ...authHeaders() } });
      if (res.ok) {
        const data = await res.json();
        sessionReport.innerHTML = `<strong>${data.totalSessions}</strong> sessions played`;
        popularityReport.innerHTML = Object.entries(data.popularity)
          .map(([sport, count]) => `<p>${sport}: ${count}</p>`).join("");
      }
    } catch (err) {
      showMessage("Error loading reports: " + err.message, "error");
    }
  }
}
loadReports();
