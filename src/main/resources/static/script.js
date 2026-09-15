// ==========================================================================
// Inventory Management System - Client Application Logic
// ==========================================================================

// Client-side cache to track products during active session
const productCache = new Map();

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    updateStatistics("System Ready");
});

// --------------------------------------------------------------------------
// Tab Navigation
// --------------------------------------------------------------------------
function switchTab(tabId) {
    const validTabs = ["add", "get", "update", "delete", "external"];
    if (!validTabs.includes(tabId)) return;

    // Update tab buttons
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.remove("active");
    });
    const activeTabBtn = document.getElementById("tab-btn-" + tabId);
    if (activeTabBtn) activeTabBtn.classList.add("active");

    // Update sidebar navigation items
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });
    const activeNavBtn = document.getElementById("nav-" + tabId);
    if (activeNavBtn) activeNavBtn.classList.add("active");

    // Update tab panes
    document.querySelectorAll(".tab-pane").forEach(pane => {
        pane.classList.remove("active");
    });
    const activePane = document.getElementById("tab-pane-" + tabId);
    if (activePane) activePane.classList.add("active");
}

// --------------------------------------------------------------------------
// API Operation: Add Product (POST /api/products)
// --------------------------------------------------------------------------
async function addProduct() {
    const idRaw = document.getElementById("addId").value.trim();
    const name = document.getElementById("addName").value.trim();
    const quantityRaw = document.getElementById("addQuantity").value.trim();
    const priceRaw = document.getElementById("addPrice").value.trim();
    const category = document.getElementById("addCategory").value.trim();

    // Rigorous input validation
    const validationError = validateProductFields(idRaw, name, quantityRaw, priceRaw, category);
    if (validationError) {
        showResult(validationError, "error", "Validation Error");
        return;
    }

    const product = {
        id: parseInt(idRaw, 10),
        name: name,
        quantity: parseInt(quantityRaw, 10),
        price: parseFloat(priceRaw),
        category: category
    };

    try {
        const response = await fetch("/api/products", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(product)
        });

        const data = await response.json();

        if (data.success) {
            productCache.set(product.id, product);
            updateStatistics("Added Product #" + product.id);
            displayProduct(product);
            clearAddForm();
            showResult(data.message, "success", "Product Added");
        } else {
            showResult(data.message, "error", "Add Failed");
        }
    } catch (error) {
        showResult("Error connecting to the server. Please ensure the backend is running.", "error", "Network Error");
    }
}

// --------------------------------------------------------------------------
// API Operation: Get Product (GET /api/products/{id})
// --------------------------------------------------------------------------
async function getProduct() {
    const idRaw = document.getElementById("getId").value.trim();

    if (!idRaw || isNaN(idRaw) || parseInt(idRaw, 10) <= 0) {
        showResult("Please enter a valid positive Product ID.", "error", "Validation Error");
        return;
    }

    const id = parseInt(idRaw, 10);

    try {
        const response = await fetch("/api/products/" + id);
        const data = await response.json();

        if (data.success && data.product) {
            productCache.set(data.product.id, data.product);
            updateStatistics("Retrieved Product #" + id);
            displayProduct(data.product);
            prefillUpdateForm(data.product);
            showResult(data.message, "success", "Product Found");
        } else {
            clearProductDetails();
            showResult(data.message || "Product not found.", "error", "Lookup Result");
        }

        document.getElementById("getId").value = "";
    } catch (error) {
        showResult("Error connecting to the server. Please ensure the backend is running.", "error", "Network Error");
    }
}

// --------------------------------------------------------------------------
// API Operation: Update Product (PUT /api/products)
// --------------------------------------------------------------------------
async function updateProduct() {
    const idRaw = document.getElementById("updateId").value.trim();
    const name = document.getElementById("updateName").value.trim();
    const quantityRaw = document.getElementById("updateQuantity").value.trim();
    const priceRaw = document.getElementById("updatePrice").value.trim();
    const category = document.getElementById("updateCategory").value.trim();

    // Rigorous input validation
    const validationError = validateProductFields(idRaw, name, quantityRaw, priceRaw, category);
    if (validationError) {
        showResult(validationError, "error", "Validation Error");
        return;
    }

    const product = {
        id: parseInt(idRaw, 10),
        name: name,
        quantity: parseInt(quantityRaw, 10),
        price: parseFloat(priceRaw),
        category: category
    };

    try {
        const response = await fetch("/api/products", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(product)
        });

        const data = await response.json();

        if (data.success) {
            productCache.set(product.id, product);
            updateStatistics("Updated Product #" + product.id);
            displayProduct(product);
            clearUpdateForm();
            showResult(data.message, "success", "Product Updated");
        } else {
            showResult(data.message, "error", "Update Failed");
        }
    } catch (error) {
        showResult("Error connecting to the server. Please ensure the backend is running.", "error", "Network Error");
    }
}

// --------------------------------------------------------------------------
// API Operation: Delete Product (DELETE /api/products/{id})
// --------------------------------------------------------------------------
async function deleteProduct() {
    const idRaw = document.getElementById("deleteId").value.trim();

    if (!idRaw || isNaN(idRaw) || parseInt(idRaw, 10) <= 0) {
        showResult("Please enter a valid positive Product ID.", "error", "Validation Error");
        return;
    }

    const id = parseInt(idRaw, 10);

    try {
        // Retrieve first to display what is being deleted
        const getResponse = await fetch("/api/products/" + id);
        const getData = await getResponse.json();

        if (!getData.success || !getData.product) {
            showResult(getData.message || "Product with ID " + id + " not found.", "error", "Not Found");
            clearProductDetails();
            return;
        }

        displayProduct(getData.product);

        // Perform DELETE request
        const deleteResponse = await fetch("/api/products/" + id, {
            method: "DELETE"
        });

        const data = await deleteResponse.json();

        if (data.success) {
            productCache.delete(id);
            updateStatistics("Deleted Product #" + id);
            showResult(data.message, "success", "Product Deleted");
            document.getElementById("deleteId").value = "";

            // Update details badge to reflect deleted status
            const badge = document.getElementById("detailsStatusBadge");
            if (badge) {
                badge.textContent = "Deleted";
                badge.style.backgroundColor = "#fef2f2";
                badge.style.color = "#dc2626";
            }
        } else {
            showResult(data.message, "error", "Delete Failed");
        }
    } catch (error) {
        showResult("Error connecting to the server. Please ensure the backend is running.", "error", "Network Error");
    }
}

// --------------------------------------------------------------------------
// Form Validation Helper
// --------------------------------------------------------------------------
function validateProductFields(idRaw, name, quantityRaw, priceRaw, category) {
    if (!idRaw) return "Please enter a Product ID.";
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id <= 0) {
        return "Product ID must be a positive whole number.";
    }

    if (!name || name.length === 0) {
        return "Please enter a Product Name.";
    }

    if (quantityRaw === "") return "Please enter a Quantity.";
    const quantity = Number(quantityRaw);
    if (!Number.isInteger(quantity) || quantity < 0) {
        return "Quantity must be an integer of 0 or greater.";
    }

    if (priceRaw === "") return "Please enter a Price.";
    const price = Number(priceRaw);
    if (isNaN(price) || price < 0) {
        return "Price must be a number of 0 or greater.";
    }

    if (!category || category.length === 0) {
        return "Please enter a Category.";
    }

    return null;
}

// --------------------------------------------------------------------------
// DOM Rendering: Display Product Details (Safe DOM Construction)
// --------------------------------------------------------------------------
function displayProduct(product) {
    const container = document.getElementById("productDetails");
    if (!container) return;

    // Clear previous contents safely
    container.innerHTML = "";

    // Wrapper
    const cardView = document.createElement("div");
    cardView.className = "product-card-view";

    // Hero Section
    const hero = document.createElement("div");
    hero.className = "product-hero";

    const heroInfo = document.createElement("div");
    heroInfo.className = "product-hero-info";

    const heroTitle = document.createElement("h3");
    heroTitle.textContent = product.name;

    const heroId = document.createElement("div");
    heroId.className = "product-hero-id";
    heroId.textContent = "ID #" + product.id + " • " + product.category;

    heroInfo.appendChild(heroTitle);
    heroInfo.appendChild(heroId);

    const heroPrice = document.createElement("div");
    heroPrice.className = "product-hero-price";
    heroPrice.textContent = "₹" + Number(product.price).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    hero.appendChild(heroInfo);
    hero.appendChild(heroPrice);
    cardView.appendChild(hero);

    // Specification Grid
    const specGrid = document.createElement("div");
    specGrid.className = "details-spec-grid";

    specGrid.appendChild(createSpecItem("Product ID", String(product.id)));
    specGrid.appendChild(createSpecItem("Category", product.category));
    specGrid.appendChild(createSpecItem("Stock Quantity", product.quantity + " units"));
    specGrid.appendChild(createSpecItem("Unit Price", "₹" + Number(product.price).toFixed(2)));

    const totalWorth = Number(product.quantity) * Number(product.price);
    specGrid.appendChild(createSpecItem("Total Stock Value", "₹" + totalWorth.toLocaleString("en-IN", { minimumFractionDigits: 2 })));
    specGrid.appendChild(createSpecItem("Status", product.quantity > 0 ? "In Stock" : "Out of Stock"));

    cardView.appendChild(specGrid);

    // Quick Actions
    const actions = document.createElement("div");
    actions.className = "product-quick-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary btn-sm";
    editBtn.textContent = "✏️ Load in Update";
    editBtn.onclick = () => {
        prefillUpdateForm(product);
        switchTab("update");
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-secondary btn-sm";
    deleteBtn.textContent = "🗑️ Load in Delete";
    deleteBtn.onclick = () => {
        document.getElementById("deleteId").value = product.id;
        switchTab("delete");
    };

    const supplierBtn = document.createElement("button");
    supplierBtn.type = "button";
    supplierBtn.className = "btn btn-info btn-sm";
    supplierBtn.textContent = "🏢 Check Supplier Stock";
    supplierBtn.onclick = () => {
        checkSupplierAvailability(product.id);
    };

    const externalBtn = document.createElement("button");
    externalBtn.type = "button";
    externalBtn.className = "btn btn-primary btn-sm";
    externalBtn.textContent = "🌐 External Intelligence";
    externalBtn.onclick = () => {
        document.getElementById("externalId").value = product.id;
        switchTab("external");
        queryExternalInfo(product.id);
    };

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(supplierBtn);
    actions.appendChild(externalBtn);
    cardView.appendChild(actions);

    const supplierContainer = document.createElement("div");
    supplierContainer.id = "supplierDetailsContainer";
    supplierContainer.className = "supplier-details-container";
    cardView.appendChild(supplierContainer);

    container.appendChild(cardView);

    // Update Details Badge
    const badge = document.getElementById("detailsStatusBadge");
    if (badge) {
        badge.textContent = product.category;
        badge.style.backgroundColor = "";
        badge.style.color = "";
    }
}

function createSpecItem(label, value) {
    const item = document.createElement("div");
    item.className = "spec-item";

    const lbl = document.createElement("div");
    lbl.className = "spec-label";
    lbl.textContent = label;

    const val = document.createElement("div");
    val.className = "spec-value";
    val.textContent = value;

    item.appendChild(lbl);
    item.appendChild(val);
    return item;
}

// --------------------------------------------------------------------------
// Empty State & Form Reset
// --------------------------------------------------------------------------
function clearProductDetails() {
    const container = document.getElementById("productDetails");
    if (!container) return;

    container.innerHTML = "";

    const empty = document.createElement("div");
    empty.className = "empty-state";

    const icon = document.createElement("div");
    icon.className = "empty-icon";
    icon.textContent = "📦";

    const title = document.createElement("h3");
    title.className = "empty-title";
    title.textContent = "No Product Selected";

    const desc = document.createElement("p");
    desc.className = "empty-desc";
    desc.textContent = "Retrieve a product using \"Get Product\" or add a new one to inspect its full details here.";

    empty.appendChild(icon);
    empty.appendChild(title);
    empty.appendChild(desc);

    container.appendChild(empty);

    const badge = document.getElementById("detailsStatusBadge");
    if (badge) {
        badge.textContent = "No Selection";
        badge.style.backgroundColor = "";
        badge.style.color = "";
    }
}

function clearAddForm() {
    document.getElementById("addId").value = "";
    document.getElementById("addName").value = "";
    document.getElementById("addQuantity").value = "";
    document.getElementById("addPrice").value = "";
    document.getElementById("addCategory").value = "";
}

function clearUpdateForm() {
    document.getElementById("updateId").value = "";
    document.getElementById("updateName").value = "";
    document.getElementById("updateQuantity").value = "";
    document.getElementById("updatePrice").value = "";
    document.getElementById("updateCategory").value = "";
}

function prefillUpdateForm(product) {
    document.getElementById("updateId").value = product.id;
    document.getElementById("updateName").value = product.name;
    document.getElementById("updateQuantity").value = product.quantity;
    document.getElementById("updatePrice").value = product.price;
    document.getElementById("updateCategory").value = product.category;
}

// --------------------------------------------------------------------------
// Status Notification / Result Display
// --------------------------------------------------------------------------
function showResult(message, type = "info", title = "") {
    const resultEl = document.getElementById("result");
    if (!resultEl) return;

    // Reset base classes
    resultEl.className = "result-banner";

    let iconText = "ℹ️";
    let defaultTitle = "Information";

    if (type === "success") {
        resultEl.classList.add("result-success");
        iconText = "✅";
        defaultTitle = "Success";
    } else if (type === "error") {
        resultEl.classList.add("result-error");
        iconText = "⚠️";
        defaultTitle = "Error";
    } else {
        resultEl.classList.add("result-info");
        iconText = "ℹ️";
        defaultTitle = "Notification";
    }

    resultEl.innerHTML = "";

    const iconSpan = document.createElement("span");
    iconSpan.className = "result-icon";
    iconSpan.textContent = iconText;

    const bodyDiv = document.createElement("div");
    bodyDiv.className = "result-body";

    const titleSpan = document.createElement("span");
    titleSpan.className = "result-title";
    titleSpan.textContent = title || defaultTitle;

    const messageSpan = document.createElement("span");
    messageSpan.className = "result-message";
    messageSpan.textContent = message;

    bodyDiv.appendChild(titleSpan);
    bodyDiv.appendChild(messageSpan);

    resultEl.appendChild(iconSpan);
    resultEl.appendChild(bodyDiv);
}

// --------------------------------------------------------------------------
// Statistics & Session Cache
// --------------------------------------------------------------------------
function updateStatistics(lastOpText) {
    const totalCount = productCache.size;
    let totalQuantity = 0;
    let totalValue = 0;

    productCache.forEach(product => {
        totalQuantity += Number(product.quantity) || 0;
        totalValue += (Number(product.quantity) || 0) * (Number(product.price) || 0);
    });

    const statCountEl = document.getElementById("statTotalProducts");
    if (statCountEl) statCountEl.textContent = totalCount;

    const statQtyEl = document.getElementById("statTotalQuantity");
    if (statQtyEl) statQtyEl.textContent = totalQuantity.toLocaleString("en-IN");

    const statValEl = document.getElementById("statTotalValue");
    if (statValEl) {
        statValEl.textContent = "₹" + totalValue.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    const statLastOpEl = document.getElementById("statLastOp");
    if (statLastOpEl && lastOpText) {
        statLastOpEl.textContent = lastOpText;
    }

    const statLastOpTimeEl = document.getElementById("statLastOpTime");
    if (statLastOpTimeEl) {
        statLastOpTimeEl.textContent = new Date().toLocaleTimeString();
    }

    renderRecentCacheList();
}

function renderRecentCacheList() {
    const container = document.getElementById("recentProductsList");
    const countBadge = document.getElementById("cachedCountBadge");
    if (!container) return;

    if (countBadge) {
        countBadge.textContent = productCache.size + (productCache.size === 1 ? " item" : " items");
    }

    container.innerHTML = "";

    if (productCache.size === 0) {
        const empty = document.createElement("div");
        empty.className = "recent-empty";
        empty.textContent = "No products recorded in this session yet.";
        container.appendChild(empty);
        return;
    }

    productCache.forEach(product => {
        const item = document.createElement("div");
        item.className = "recent-item";
        item.title = "Click to inspect Product #" + product.id;
        item.onclick = () => {
            displayProduct(product);
            prefillUpdateForm(product);
        };

        const left = document.createElement("div");
        left.className = "recent-item-left";

        const idSpan = document.createElement("span");
        idSpan.className = "recent-item-id";
        idSpan.textContent = "#" + product.id;

        const nameSpan = document.createElement("span");
        nameSpan.className = "recent-item-name";
        nameSpan.textContent = product.name;

        left.appendChild(idSpan);
        left.appendChild(nameSpan);

        const priceSpan = document.createElement("span");
        priceSpan.className = "recent-item-price";
        priceSpan.textContent = "₹" + Number(product.price).toFixed(2);

        item.appendChild(left);
        item.appendChild(priceSpan);

        container.appendChild(item);
    });
}

// --------------------------------------------------------------------------
// Supplier Microservice Integration (Port 8081 via Inventory Backend)
// --------------------------------------------------------------------------
async function checkSupplierAvailability(productId) {
    const container = document.getElementById("supplierDetailsContainer");
    if (!container) return;

    container.innerHTML = `
        <div class="supplier-loading">
            <span class="supplier-spinner">🔄</span>
            <span>Querying independent Supplier Service (Port 8081)...</span>
        </div>
    `;

    try {
        const response = await fetch("/api/products/" + productId + "/supplier");
        const data = await response.json();

        container.innerHTML = "";

        const card = document.createElement("div");
        card.className = "supplier-card " + (data.available ? "supplier-available" : "supplier-unavailable");

        const header = document.createElement("div");
        header.className = "supplier-card-header";

        const titleGroup = document.createElement("div");
        const badge = document.createElement("span");
        badge.className = "supplier-status-badge " + (data.available ? "badge-avail" : "badge-unavail");
        badge.textContent = data.available ? "✔ Supplier Stock Available" : "✖ Not Available";

        const title = document.createElement("h4");
        title.className = "supplier-card-title";
        title.textContent = data.supplierName || "Supplier";

        titleGroup.appendChild(badge);
        titleGroup.appendChild(title);

        const portBadge = document.createElement("span");
        portBadge.className = "supplier-service-tag";
        portBadge.textContent = "Supplier Service :8081";

        header.appendChild(titleGroup);
        header.appendChild(portBadge);

        const grid = document.createElement("div");
        grid.className = "supplier-grid";

        grid.appendChild(createSupplierStat("Product ID", "#" + data.productId));
        grid.appendChild(createSupplierStat("Available Quantity", data.availableQuantity + " units"));
        grid.appendChild(createSupplierStat("Supplier Price", "₹" + Number(data.supplierPrice).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
        grid.appendChild(createSupplierStat("Status", data.available ? "In Stock" : "Unavailable"));

        card.appendChild(header);
        card.appendChild(grid);

        if (data.message) {
            const note = document.createElement("div");
            note.className = "supplier-note";
            note.textContent = data.message;
            card.appendChild(note);
        }

        container.appendChild(card);
        showResult("Supplier data received from port 8081: " + (data.available ? "Available" : "Not Available"), data.available ? "success" : "info", "Distributed Call");
    } catch (err) {
        container.innerHTML = `
            <div class="supplier-error">
                ⚠️ Could not communicate with Supplier Service. Ensure the service is running on port 8081.
            </div>
        `;
        showResult("Failed to reach Supplier Service on port 8081", "error", "Network Error");
    }
}

function createSupplierStat(label, value) {
    const div = document.createElement("div");
    div.className = "supplier-stat-item";

    const lbl = document.createElement("span");
    lbl.className = "supplier-stat-label";
    lbl.textContent = label;

    const val = document.createElement("span");
    val.className = "supplier-stat-value";
    val.textContent = value;

    div.appendChild(lbl);
    div.appendChild(val);
    return div;
}

// --------------------------------------------------------------------------
// Multi-API External Intelligence (Frankfurter + Open-Meteo + Supplier)
// --------------------------------------------------------------------------
async function queryExternalInfo(productIdOpt) {
    const idInput = document.getElementById("externalId");
    let productId = productIdOpt;

    if (!productId && idInput) {
        const raw = idInput.value.trim();
        if (!raw || isNaN(raw) || parseInt(raw, 10) <= 0) {
            showResult("Please enter a valid positive Product ID.", "error", "Validation Error");
            return;
        }
        productId = parseInt(raw, 10);
    }

    const container = document.getElementById("externalInfoResult");
    if (!container) return;

    container.innerHTML = `
        <div class="external-loading">
            <span class="external-spinner">🔄</span>
            <span>Querying AWS RDS Database + Supplier Service (:8081) + Frankfurter API + Open-Meteo API...</span>
        </div>
    `;

    try {
        const response = await fetch("/api/products/" + productId + "/external-info");
        const data = await response.json();

        container.innerHTML = "";

        if (!data.success) {
            container.innerHTML = `
                <div class="external-error-box">
                    <span class="err-icon">⚠️</span>
                    <div>
                        <strong>Query Failed:</strong> ${data.message || "Product not found"}
                    </div>
                </div>
            `;
            showResult(data.message || "Product not found", "error", "External Query");
            return;
        }

        const grid = document.createElement("div");
        grid.className = "external-quad-grid";

        // Card 1: Product Database Info
        const prodCard = document.createElement("div");
        prodCard.className = "external-card card-database";
        prodCard.innerHTML = `
            <div class="ext-card-header">
                <span class="ext-icon">📦</span>
                <div>
                    <h4 class="ext-title">Database Record</h4>
                    <span class="ext-source">AWS RDS PostgreSQL</span>
                </div>
            </div>
            <div class="ext-card-body">
                <div class="ext-stat-row"><span>Product ID:</span> <strong>#${data.product.id}</strong></div>
                <div class="ext-stat-row"><span>Name:</span> <strong>${data.product.name}</strong></div>
                <div class="ext-stat-row"><span>Category:</span> <strong>${data.product.category}</strong></div>
                <div class="ext-stat-row"><span>Stock Qty:</span> <strong>${data.product.quantity} units</strong></div>
                <div class="ext-stat-row"><span>Price:</span> <strong>₹${Number(data.product.price).toLocaleString("en-IN", {minimumFractionDigits: 2})}</strong></div>
            </div>
        `;
        grid.appendChild(prodCard);

        // Card 2: Supplier Service Info
        const sup = data.supplierInfo;
        const supCard = document.createElement("div");
        supCard.className = "external-card " + (sup && sup.available ? "card-supplier-avail" : "card-supplier-unavail");
        supCard.innerHTML = `
            <div class="ext-card-header">
                <span class="ext-icon">🏢</span>
                <div>
                    <h4 class="ext-title">Supplier Availability</h4>
                    <span class="ext-source">Distributed Service :8081</span>
                </div>
            </div>
            <div class="ext-card-body">
                <div class="ext-stat-row"><span>Supplier Name:</span> <strong>${sup ? sup.supplierName : "N/A"}</strong></div>
                <div class="ext-stat-row"><span>Available Stock:</span> <strong>${sup ? sup.availableQuantity : 0} units</strong></div>
                <div class="ext-stat-row"><span>Supplier Price:</span> <strong>₹${sup ? Number(sup.supplierPrice).toLocaleString("en-IN", {minimumFractionDigits: 2}) : "0.00"}</strong></div>
                <div class="ext-stat-row"><span>Status:</span> <span class="ext-badge ${sup && sup.available ? 'badge-success-ext' : 'badge-danger-ext'}">${sup && sup.available ? 'Available' : 'Unavailable'}</span></div>
                <div class="ext-stat-status">${sup && sup.message ? sup.message : ""}</div>
            </div>
        `;
        grid.appendChild(supCard);

        // Card 3: Frankfurter Currency Exchange
        const cur = data.currencyInfo;
        const curCard = document.createElement("div");
        curCard.className = "external-card card-currency";
        curCard.innerHTML = `
            <div class="ext-card-header">
                <span class="ext-icon">💱</span>
                <div>
                    <h4 class="ext-title">Currency Conversion</h4>
                    <span class="ext-source">Frankfurter Public API</span>
                </div>
            </div>
            <div class="ext-card-body">
                <div class="ext-stat-row"><span>Base Currency:</span> <strong>${cur ? cur.baseCurrency : "EUR"}</strong></div>
                <div class="ext-stat-row"><span>Target Currency:</span> <strong>${cur ? cur.targetCurrency : "USD"}</strong></div>
                <div class="ext-stat-row"><span>Exchange Rate:</span> <strong>${cur ? cur.exchangeRate : "N/A"}</strong></div>
                <div class="ext-stat-row"><span>Converted Price:</span> <strong>$${cur ? Number(cur.convertedPrice).toLocaleString("en-US", {minimumFractionDigits: 2}) : "0.00"} USD</strong></div>
                <div class="ext-stat-status">${cur && cur.status ? cur.status : ""}</div>
            </div>
        `;
        grid.appendChild(curCard);

        // Card 4: Open-Meteo Weather Info
        const wtr = data.weatherInfo;
        const wtrCard = document.createElement("div");
        wtrCard.className = "external-card card-weather";
        wtrCard.innerHTML = `
            <div class="ext-card-header">
                <span class="ext-icon">🌤️</span>
                <div>
                    <h4 class="ext-title">Warehouse Weather</h4>
                    <span class="ext-source">Open-Meteo Public API</span>
                </div>
            </div>
            <div class="ext-card-body">
                <div class="ext-stat-row"><span>Location:</span> <strong>${wtr ? wtr.location : "Hub"}</strong></div>
                <div class="ext-stat-row"><span>Temperature:</span> <strong>${wtr ? wtr.temperature : 0.0}°C</strong></div>
                <div class="ext-stat-row"><span>Wind Speed:</span> <strong>${wtr ? wtr.windSpeed : 0.0} km/h</strong></div>
                <div class="ext-stat-row"><span>Condition:</span> <strong>${wtr ? wtr.weatherCondition : "N/A"}</strong></div>
                <div class="ext-stat-status">${wtr && wtr.status ? wtr.status : ""}</div>
            </div>
        `;
        grid.appendChild(wtrCard);

        container.appendChild(grid);
        showResult("Combined intelligence retrieved across 4 distributed sources!", "success", "External Info Retrieved");

        if (idInput) idInput.value = "";
    } catch (err) {
        container.innerHTML = `
            <div class="external-error-box">
                <span class="err-icon">⚠️</span>
                <div>
                    <strong>Connection Error:</strong> Unable to retrieve external information. Ensure backend server is active.
                </div>
            </div>
        `;
        showResult("Network error communicating with server", "error", "Network Error");
    }
}