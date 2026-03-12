// Fetch uploads and render the table

async function fetchUploads() {
  const cfg = getConfig();
  const token = getIdToken();

  const response = await fetch(`${cfg.apiBaseUrl}/api/v1/uploads`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) {
    redirectToLogin();
    return [];
  }

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  return data.uploads;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderUploads(uploads) {
  const tbody = document.getElementById("uploads-body");
  const empty = document.getElementById("empty-state");

  if (uploads.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  tbody.innerHTML = uploads
    .map(
      (u) => `
    <tr>
      <td>${escapeHtml(u.filename)}</td>
      <td>${formatSize(u.sizeBytes)}</td>
      <td>${escapeHtml(u.userName || u.userEmail || "—")}</td>
      <td>${formatDate(u.confirmedAt || u.createdAt)}</td>
      <td><a href="${escapeHtml(u.downloadUrl)}" class="download-link">Download</a></td>
    </tr>`
    )
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function init() {
  if (!isLoggedIn()) {
    redirectToLogin();
    return;
  }

  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("refresh-btn").addEventListener("click", loadUploads);
  document.getElementById("app").style.display = "block";

  await loadUploads();
}

async function loadUploads() {
  const loading = document.getElementById("loading");
  const error = document.getElementById("error");

  loading.style.display = "block";
  error.style.display = "none";

  try {
    const uploads = await fetchUploads();
    renderUploads(uploads);
  } catch (err) {
    error.textContent = `Failed to load uploads: ${err.message}`;
    error.style.display = "block";
  } finally {
    loading.style.display = "none";
  }
}

document.addEventListener("DOMContentLoaded", init);
