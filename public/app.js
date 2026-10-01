// DOM Elements
const form = document.getElementById("shortenForm");
const originalUrlInput = document.getElementById("originalUrl");
const customCodeInput = document.getElementById("customCode");
const result = document.getElementById("result");
const shortLink = document.getElementById("shortLink");
const originalLink = document.getElementById("originalLink");
const urlList = document.getElementById("urlList");
const errorMessage = document.getElementById("errorMessage");
const searchBox = document.getElementById("searchBox");
const totalUrlsDisplay = document.getElementById("totalUrls");
const totalClicksDisplay = document.getElementById("totalClicks");

let allUrls = [];

// Copy to Clipboard
function copyToClipboard() {
    const text = shortLink.value;
    navigator.clipboard.writeText(text).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = "✓ Copied!";
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    });
}

// Show Error
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove("hidden");
    errorMessage.classList.add("show");
    setTimeout(() => {
        errorMessage.classList.remove("show");
        errorMessage.classList.add("hidden");
    }, 5000);
}

// Format Date
function formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    } else if (date.toDateString() === yesterday.toDateString()) {
        return "Yesterday";
    } else {
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
}

// Load and Display URLs
async function loadUrls() {
    try {
        const res = await fetch("/api/urls");
        if (!res.ok) throw new Error("Failed to load URLs");

        allUrls = await res.json();
        displayUrls(allUrls);
        updateStats();
    } catch (error) {
        console.error("Error loading URLs:", error);
        showError("Failed to load URLs");
    }
}

// Display URLs
function displayUrls(urls) {
    urlList.innerHTML = "";

    if (!urls.length) {
        urlList.innerHTML = '<div class="empty-state">No URLs shortened yet. Create your first one!</div>';
        return;
    }

    urls
        .slice()
        .reverse()
        .forEach((entry) => {
            const li = document.createElement("div");
            li.className = "url-item";
            li.innerHTML = `
                <div class="url-item-header">
                    <div class="url-item-title">
                        <strong>Original URL:</strong>
                        <a href="${entry.originalUrl}" target="_blank" rel="noopener noreferrer" title="${entry.originalUrl}">
                            ${entry.originalUrl.substring(0, 60)}${entry.originalUrl.length > 60 ? "..." : ""}
                        </a>
                    </div>
                    <div class="url-item-actions">
                        <button class="btn-small btn-copy-small" onclick="copyUrlLink('${entry.shortUrl}')">Copy</button>
                        <button class="btn-small btn-stats" onclick="showStats('${entry.shortCode}')">Stats</button>
                        <button class="btn-small btn-delete" onclick="deleteUrl('${entry.shortCode}')">Delete</button>
                    </div>
                </div>
                <div>
                    <strong style="color: var(--text-muted); font-size: 0.9rem;">Short URL:</strong><br>
                    <a href="${entry.shortUrl}" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color); font-size: 1.05rem; font-weight: 600;">
                        ${entry.shortUrl}
                    </a>
                </div>
                <div class="url-item-meta">
                    <div class="url-item-meta-item">
                        <span class="url-item-meta-label">Clicks</span>
                        <span class="url-item-meta-value">${entry.clicks || 0}</span>
                    </div>
                    <div class="url-item-meta-item">
                        <span class="url-item-meta-label">Created</span>
                        <span class="url-item-meta-value">${formatDate(entry.createdAt)}</span>
                    </div>
                    <div class="url-item-meta-item">
                        <span class="url-item-meta-label">Code</span>
                        <span class="url-item-meta-value">${entry.shortCode}</span>
                    </div>
                </div>
            `;
            urlList.appendChild(li);
        });
}

// Copy URL Link
function copyUrlLink(url) {
    navigator.clipboard.writeText(url).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = "✓ Copied!";
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    });
}

// Show Stats
async function showStats(code) {
    try {
        const res = await fetch(`/api/urls/${code}`);
        if (!res.ok) throw new Error("Failed to load stats");

        const data = await res.json();
        alert(`Stats for ${code}:\n\nClicks: ${data.clicks || 0}\nCreated: ${formatDate(data.createdAt)}`);
    } catch (error) {
        console.error("Error loading stats:", error);
        showError("Failed to load stats");
    }
}

// Delete URL
async function deleteUrl(code) {
    if (!confirm(`Are you sure you want to delete this short URL (${code})?`)) {
        return;
    }

    try {
        const res = await fetch(`/api/urls/${code}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete URL");

        loadUrls();
        showError(`URL "${code}" deleted successfully!`);
    } catch (error) {
        console.error("Error deleting URL:", error);
        showError("Failed to delete URL");
    }
}

// Update Statistics
function updateStats() {
    const totalUrls = allUrls.length;
    const totalClicks = allUrls.reduce((sum, url) => sum + (url.clicks || 0), 0);

    totalUrlsDisplay.textContent = totalUrls;
    totalClicksDisplay.textContent = totalClicks;
}

// Search Functionality
searchBox.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    const filtered = allUrls.filter((url) =>
        url.originalUrl.toLowerCase().includes(query) ||
        url.shortCode.toLowerCase().includes(query) ||
        url.shortUrl.toLowerCase().includes(query)
    );
    displayUrls(filtered);
});

// Form Submission
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMessage.classList.add("hidden");
    errorMessage.classList.remove("show");

    const url = originalUrlInput.value.trim();
    const customCode = customCodeInput.value.trim();

    if (!url) {
        showError("Please enter a URL");
        return;
    }

    try {
        const payload = { url };
        if (customCode) {
            payload.customCode = customCode;
        }

        const res = await fetch("/api/shorten", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) {
            showError(data.error || "Something went wrong");
            return;
        }

        // Display result
        shortLink.value = data.shortUrl;
        originalLink.href = data.originalUrl;
        originalLink.textContent = data.originalUrl.substring(0, 60) + (data.originalUrl.length > 60 ? "..." : "");
        result.classList.remove("hidden");

        // Clear inputs
        originalUrlInput.value = "";
        customCodeInput.value = "";
        searchBox.value = "";

        // Reload URLs
        loadUrls();

        // Scroll to result
        result.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
        console.error("Error:", error);
        showError("An error occurred. Please try again.");
    }
});

// Initial Load
loadUrls();
