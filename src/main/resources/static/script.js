// ==========================================================================
// Inventory Management System - Client Application Logic (SOAP 1.1 Web Services)
// All CRUD and External Orchestration operations communicate via POST /ws
// ==========================================================================

// Client-side cache synchronized with backend database via SOAP getAllProducts
const productCache = new Map();

// Configurable threshold for low-stock warning (items below this quantity are flagged)
const LOW_STOCK_THRESHOLD = 5;

// Initialize on page load: retrieve persisted inventory from backend via SOAP
document.addEventListener("DOMContentLoaded", () => {
    fetchAllProducts();
    fetchStockMovements();
    fetchWeatherAdvisories();
});

// --------------------------------------------------------------------------
// XML & SOAP 1.1 Helper Utilities
// --------------------------------------------------------------------------
const SOAP_NAMESPACE = "http://example.com/inventory";

function escapeXml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function getXmlNode(parent, localName) {
    if (!parent) return null;
    let nodes = parent.getElementsByTagName(localName);
    if (nodes && nodes.length > 0) return nodes[0];
    nodes = parent.getElementsByTagNameNS("*", localName);
    if (nodes && nodes.length > 0) return nodes[0];
    nodes = parent.getElementsByTagNameNS(SOAP_NAMESPACE, localName);
    if (nodes && nodes.length > 0) return nodes[0];
    for (let i = 0; i < parent.childNodes.length; i++) {
        const node = parent.childNodes[i];
        if (node.nodeType === 1 && (node.localName === localName || node.nodeName.endsWith(":" + localName) || node.nodeName === localName)) {
            return node;
        }
    }
    return null;
}

function getXmlValue(parent, localName) {
    const node = getXmlNode(parent, localName);
    return node && node.textContent ? node.textContent.trim() : "";
}

function formatXmlForDisplay(xmlString) {
    if (!xmlString) return "";
    try {
        let formatted = "";
        let pad = 0;
        const reg = /(>)(<)(\/*)/g;
        const xml = xmlString.replace(reg, "$1\r\n$2$3");
        const lines = xml.split("\r\n");

        lines.forEach(line => {
            let indent = 0;
            if (line.match(/.+<\/\w[^>]*>$/)) {
                indent = 0;
            } else if (line.match(/^<\/\w/)) {
                if (pad !== 0) pad -= 1;
            } else if (line.match(/^<\w[^>]*[^\/]>.*$/)) {
                indent = 1;
            } else {
                indent = 0;
            }
            const padding = "  ".repeat(Math.max(0, pad));
            formatted += padding + line + "\n";
            pad += indent;
        });
        return formatted.trim();
    } catch (e) {
        return xmlString;
    }
}

async function callSoapService(operationName, bodyPayloadXml) {
    const normalizedAction = operationName ? (operationName.charAt(0).toUpperCase() + operationName.slice(1)) : "";
    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:inv="${SOAP_NAMESPACE}">
    <soap:Header/>
    <soap:Body>
        ${bodyPayloadXml}
    </soap:Body>
</soap:Envelope>`;

    try {
        const response = await fetch("/ws", {
            method: "POST",
            headers: {
                "Content-Type": "text/xml; charset=utf-8",
                "SOAPAction": `"${SOAP_NAMESPACE}/${normalizedAction}"`
            },
            body: envelope
        });

        const rawXml = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(rawXml, "text/xml");

        // Check for XML parsing error
        const parseError = xmlDoc.getElementsByTagName("parsererror");
        if (parseError && parseError.length > 0) {
            return {
                ok: false,
                status: response.status,
                rawXml: rawXml,
                xmlDoc: null,
                fault: "XML Parsing Error: Server response could not be parsed as XML."
            };
        }

        // Check for SOAP Fault
        const faultNode = getXmlNode(xmlDoc, "Fault");
        let faultMessage = null;
        if (faultNode) {
            faultMessage = getXmlValue(faultNode, "faultstring") || "SOAP Fault returned by server.";
        }

        return {
            ok: response.ok && !faultMessage,
            status: response.status,
            rawXml: rawXml,
            xmlDoc: xmlDoc,
            fault: faultMessage
        };
    } catch (err) {
        return {
            ok: false,
            status: 0,
            rawXml: "",
            xmlDoc: null,
            fault: err.message || "Network connection error while calling SOAP endpoint (/ws)"
        };
    }
}

// --------------------------------------------------------------------------
// Navigation & Views
// --------------------------------------------------------------------------
let currentActiveSection = "overview";

function navigateTo(sectionId) {
    const validSections = ["overview", "products", "activity", "restocking", "operations"];
    if (!validSections.includes(sectionId)) return;

    currentActiveSection = sectionId;

    // Update nav items
    document.querySelectorAll(".nav-item").forEach(item => {
        item.classList.remove("active");
    });
    const activeNav = document.getElementById("nav-" + sectionId);
    if (activeNav) activeNav.classList.add("active");

    // Update view sections
    document.querySelectorAll(".view-section").forEach(sec => {
        sec.classList.remove("active");
    });
    const activeView = document.getElementById("view-" + sectionId);
    if (activeView) activeView.classList.add("active");

    // Update Header Title & Subtitle
    const titleEl = document.getElementById("pageTitle");
    const subEl = document.getElementById("pageSubtitle");
    if (titleEl && subEl) {
        switch (sectionId) {
            case "overview":
                titleEl.textContent = "Inventory Overview";
                subEl.textContent = "Live summary of catalog stock, low-inventory alerts, and recent movements.";
                break;
            case "products":
                titleEl.textContent = "Product Catalog";
                subEl.textContent = "Manage inventory items, stock levels, categories, and pricing.";
                renderInventoryTable();
                break;
            case "activity":
                titleEl.textContent = "Stock Activity";
                subEl.textContent = "Chronological audit trail of all inventory receipts, removals, and adjustments.";
                break;
            case "restocking":
                titleEl.textContent = "Restocking & Replenishment";
                subEl.textContent = "Automated replenishment recommendations and supplier availability.";
                renderSmartRestocking();
                break;
            case "operations":
                titleEl.textContent = "Warehouse Operations";
                subEl.textContent = "Facility weather conditions and operational advisories affecting logistics and staging.";
                break;
        }
    }
}

function refreshCurrentView() {
    switch (currentActiveSection) {
        case "overview":
            fetchAllProducts(true);
            fetchStockMovements(true);
            break;
        case "products":
            fetchAllProducts(true);
            break;
        case "activity":
            fetchStockMovements(true);
            break;
        case "restocking":
            fetchAllProducts(true).then(() => renderSmartRestocking());
            break;
        case "operations":
            fetchWeatherAdvisories(true);
            break;
    }
}

// Modal management
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add("show");
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("show");
    }
}

function onBackdropClick(event, modalId) {
    if (event.target && event.target.id === modalId) {
        closeModal(modalId);
    }
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        document.querySelectorAll(".modal-overlay.show").forEach(modal => {
            modal.classList.remove("show");
        });
    }
});

function switchTab(tabId) {
    if (tabId === "add") {
        openModal("modal-add");
    } else if (tabId === "update") {
        openModal("modal-update");
    } else if (tabId === "adjust") {
        openModal("modal-adjust");
    } else if (tabId === "delete") {
        openModal("modal-delete");
    }
}

// --------------------------------------------------------------------------
// SOAP Output Display Renderer
// --------------------------------------------------------------------------
function renderSoapResponseCard(operation, status, message, productData = null, rawXml = "") {
    const card = document.getElementById("soapResponseCard");
    const label = document.getElementById("soapEndpointLabel");
    const statusBadge = document.getElementById("soapResponseStatus");
    const body = document.getElementById("soapResponseBody");
    const rawCode = document.getElementById("soapRawXmlCode");

    if (!card || !body) return;

    card.style.display = "block";

    if (label) {
        label.textContent = `Target: POST /ws • Operation: ${operation} • Namespace: ${SOAP_NAMESPACE}`;
    }

    const isSuccess = status === "SUCCESS";

    if (statusBadge) {
        statusBadge.textContent = status;
        statusBadge.className = "soap-status-badge " + (isSuccess ? "badge-success" : "badge-error");
    }

    // Build structured output matching required format
    let detailsHtml = `
        <div class="soap-output-summary">
            <div class="soap-meta-banner">
                <span class="soap-meta-tag">SOAP 1.1 Web Service</span>
                <span class="soap-meta-route">Endpoint: <code>/ws</code></span>
                <span class="soap-meta-op">Action: <strong>${operation}</strong></span>
            </div>

            <div class="soap-receipt-box">
                <div class="soap-receipt-header">SOAP RESPONSE</div>
                <div class="soap-receipt-row"><span>Operation:</span> <strong>${operation}</strong></div>
                <div class="soap-receipt-row"><span>Status:</span> <strong class="${isSuccess ? 'text-success' : 'text-danger'}">${status}</strong></div>
                <div class="soap-receipt-row"><span>Message:</span> <span>${escapeXml(message)}</span></div>
    `;

    if (productData) {
        detailsHtml += `
                <div class="soap-receipt-divider"></div>
                <div class="soap-receipt-row"><span>Product ID:</span> <strong>#${productData.id}</strong></div>
                ${productData.name ? `<div class="soap-receipt-row"><span>Name:</span> <strong>${escapeXml(productData.name)}</strong></div>` : ''}
                ${productData.quantity !== undefined ? `<div class="soap-receipt-row"><span>Quantity:</span> <strong>${productData.quantity} units</strong></div>` : ''}
                ${productData.price !== undefined ? `<div class="soap-receipt-row"><span>Price:</span> <strong>₹${Number(productData.price).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</strong></div>` : ''}
                ${productData.category ? `<div class="soap-receipt-row"><span>Category:</span> <strong>${escapeXml(productData.category)}</strong></div>` : ''}
        `;
    }

    detailsHtml += `
            </div>
        </div>
    `;

    body.innerHTML = detailsHtml;

    if (rawCode && rawXml) {
        rawCode.textContent = formatXmlForDisplay(rawXml);
    }
}

// --------------------------------------------------------------------------
// 1. SOAP Operation: addProduct (POST /ws -> AddProductRequest)
// --------------------------------------------------------------------------
async function addProduct() {
    const idRaw = document.getElementById("addId").value.trim();
    const name = document.getElementById("addName").value.trim();
    const quantityRaw = document.getElementById("addQuantity").value.trim();
    const priceRaw = document.getElementById("addPrice").value.trim();
    const category = document.getElementById("addCategory").value.trim();

    // Input validation
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

    // Construct SOAP 1.1 AddProductRequest payload
    const soapPayload = `
        <inv:AddProductRequest>
            <inv:product>
                <inv:id>${product.id}</inv:id>
                <inv:name>${escapeXml(product.name)}</inv:name>
                <inv:quantity>${product.quantity}</inv:quantity>
                <inv:price>${product.price}</inv:price>
                <inv:category>${escapeXml(product.category)}</inv:category>
            </inv:product>
        </inv:AddProductRequest>`;

    showResult("Saving product...", "info", "Add Product");

    const result = await callSoapService("addProduct", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "Service communication failure.";
        showResult(errorMsg, "error", "Add Product");
        renderSoapResponseCard("addProduct", "FAULT", errorMsg, product, result.rawXml);
        return;
    }

    // Parse AddProductResponse
    const responseNode = getXmlNode(result.xmlDoc, "AddProductResponse");
    const successStr = getXmlValue(responseNode, "success");
    const isSuccess = successStr.toLowerCase() === "true";
    const message = getXmlValue(responseNode, "message") || (isSuccess ? "Product added successfully" : "Failed to add product");

    if (isSuccess) {
        closeModal("modal-add");
        displayProduct(product);
        clearAddForm();
        showResult("Product #" + product.id + " (" + product.name + ") added successfully.", "success", "Product Added");
        renderSoapResponseCard("addProduct", "SUCCESS", message, product, result.rawXml);
        await fetchAllProducts(false, "Added #" + product.id);
        await fetchStockMovements(false);
    } else {
        showResult(message, "error", "Failed to Add Product");
        renderSoapResponseCard("addProduct", "FAILED", message, product, result.rawXml);
    }
}

// --------------------------------------------------------------------------
// 2. SOAP Operation: getProduct (POST /ws -> GetProductRequest)
// --------------------------------------------------------------------------
async function getProduct() {
    const idRaw = document.getElementById("getId").value.trim();

    if (!idRaw || isNaN(idRaw) || parseInt(idRaw, 10) <= 0) {
        showResult("Please enter a valid positive Product ID.", "error", "Validation Error");
        return;
    }

    const id = parseInt(idRaw, 10);

    // Construct SOAP 1.1 GetProductRequest payload
    const soapPayload = `
        <inv:GetProductRequest>
            <inv:id>${id}</inv:id>
        </inv:GetProductRequest>`;

    showResult(`Retrieving product #${id}...`, "info", "Find Product");

    const result = await callSoapService("getProduct", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "Service communication failure.";
        showResult(errorMsg, "error", "Find Product");
        clearProductDetails();
        renderSoapResponseCard("getProduct", "FAULT", errorMsg, { id: id }, result.rawXml);
        return;
    }

    // Parse GetProductResponse
    const responseNode = getXmlNode(result.xmlDoc, "GetProductResponse");
    const successStr = getXmlValue(responseNode, "success");
    const isSuccess = successStr.toLowerCase() === "true";
    const message = getXmlValue(responseNode, "message");
    const productNode = getXmlNode(responseNode, "product");

    if (isSuccess && productNode) {
        const product = {
            id: parseInt(getXmlValue(productNode, "id") || id, 10),
            name: getXmlValue(productNode, "name"),
            quantity: parseInt(getXmlValue(productNode, "quantity") || "0", 10),
            price: parseFloat(getXmlValue(productNode, "price") || "0.0"),
            category: getXmlValue(productNode, "category")
        };

        productCache.set(product.id, product);
        updateStatistics("Retrieved #" + id);
        displayProduct(product);
        prefillUpdateForm(product);
        showResult(message || "Product retrieved successfully.", "success", "Product Found");
        renderSoapResponseCard("getProduct", "SUCCESS", message || "Product found successfully", product, result.rawXml);
    } else {
        clearProductDetails();
        const notFoundMsg = message || `Product with ID ${id} not found in catalog.`;
        showResult(notFoundMsg, "error", "Product Not Found");
        renderSoapResponseCard("getProduct", "NOT FOUND", notFoundMsg, { id: id }, result.rawXml);
    }

    document.getElementById("getId").value = "";
}

// --------------------------------------------------------------------------
// 3. SOAP Operation: updateProduct (POST /ws -> UpdateProductRequest)
// --------------------------------------------------------------------------
async function updateProduct() {
    const idRaw = document.getElementById("updateId").value.trim();
    const name = document.getElementById("updateName").value.trim();
    const quantityRaw = document.getElementById("updateQuantity").value.trim();
    const priceRaw = document.getElementById("updatePrice").value.trim();
    const category = document.getElementById("updateCategory").value.trim();

    // Input validation
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

    // Construct SOAP 1.1 UpdateProductRequest payload
    const soapPayload = `
        <inv:UpdateProductRequest>
            <inv:product>
                <inv:id>${product.id}</inv:id>
                <inv:name>${escapeXml(product.name)}</inv:name>
                <inv:quantity>${product.quantity}</inv:quantity>
                <inv:price>${product.price}</inv:price>
                <inv:category>${escapeXml(product.category)}</inv:category>
            </inv:product>
        </inv:UpdateProductRequest>`;

    showResult(`Updating product #${product.id}...`, "info", "Update Product");

    const result = await callSoapService("updateProduct", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "Service communication failure.";
        showResult(errorMsg, "error", "Update Product");
        renderSoapResponseCard("updateProduct", "FAULT", errorMsg, product, result.rawXml);
        return;
    }

    // Parse UpdateProductResponse
    const responseNode = getXmlNode(result.xmlDoc, "UpdateProductResponse");
    const successStr = getXmlValue(responseNode, "success");
    const isSuccess = successStr.toLowerCase() === "true";
    const message = getXmlValue(responseNode, "message") || (isSuccess ? "Product updated successfully" : "Failed to update product");

    if (isSuccess) {
        closeModal("modal-update");
        displayProduct(product);
        clearUpdateForm();
        showResult("Product #" + product.id + " updated successfully.", "success", "Product Updated");
        renderSoapResponseCard("updateProduct", "SUCCESS", message, product, result.rawXml);
        await fetchAllProducts(false, "Updated #" + product.id);
        await fetchStockMovements(false);
    } else {
        showResult(message, "error", "Failed to Update Product");
        renderSoapResponseCard("updateProduct", "FAILED", message, product, result.rawXml);
    }
}

// --------------------------------------------------------------------------
// 4. SOAP Operation: deleteProduct (POST /ws -> DeleteProductRequest)
// --------------------------------------------------------------------------
async function deleteProduct() {
    const idRaw = document.getElementById("deleteId").value.trim();

    if (!idRaw || isNaN(idRaw) || parseInt(idRaw, 10) <= 0) {
        showResult("Please enter a valid positive Product ID.", "error", "Validation Error");
        return;
    }

    const id = parseInt(idRaw, 10);

    // Construct SOAP 1.1 DeleteProductRequest payload
    const soapPayload = `
        <inv:DeleteProductRequest>
            <inv:id>${id}</inv:id>
        </inv:DeleteProductRequest>`;

    showResult(`Deleting product #${id}...`, "info", "Delete Product");

    const result = await callSoapService("deleteProduct", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "Service communication failure.";
        showResult(errorMsg, "error", "Delete Product");
        renderSoapResponseCard("deleteProduct", "FAULT", errorMsg, { id: id }, result.rawXml);
        return;
    }

    // Parse DeleteProductResponse
    const responseNode = getXmlNode(result.xmlDoc, "DeleteProductResponse");
    const successStr = getXmlValue(responseNode, "success");
    const isSuccess = successStr.toLowerCase() === "true";
    const message = getXmlValue(responseNode, "message") || (isSuccess ? "Product deleted successfully" : "Failed to delete product");

    if (isSuccess) {
        closeModal("modal-delete");
        closeModal("modal-details");

        // Immediately purge from client cache and refresh UI
        productCache.delete(id);
        renderInventoryTable();
        renderSmartRestocking();
        updateStatistics("Deleted #" + id);

        const detailsContainer = document.getElementById("productDetails");
        if (detailsContainer) {
            detailsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📦</div>
                    <h3 class="empty-title">No Product Selected</h3>
                </div>
            `;
        }

        showResult("Product #" + id + " permanently deleted from catalog.", "success", "Product Deleted");
        renderSoapResponseCard("deleteProduct", "SUCCESS", message, { id: id }, result.rawXml);
        document.getElementById("deleteId").value = "";

        const badge = document.getElementById("detailsStatusBadge");
        if (badge) {
            badge.textContent = "Deleted";
            badge.style.backgroundColor = "#fef2f2";
            badge.style.color = "#dc2626";
        }
        await fetchAllProducts(false, "Deleted #" + id);
        await fetchStockMovements(false);
    } else {
        showResult(message, "error", "Failed to Delete Product");
        renderSoapResponseCard("deleteProduct", "FAILED", message, { id: id }, result.rawXml);
    }
}

// --------------------------------------------------------------------------
// 5. SOAP Operation: checkSupplierAvailability (POST /ws)
// --------------------------------------------------------------------------
async function checkSupplierAvailability(productId) {
    const container = document.getElementById("supplierDetailsContainer");
    if (!container) return;

    container.innerHTML = `
        <div class="supplier-loading">
            <span class="supplier-spinner">🔄</span>
            <span>Checking supplier availability...</span>
        </div>
    `;

    const soapPayload = `
        <inv:CheckSupplierAvailabilityRequest>
            <inv:productId>${productId}</inv:productId>
        </inv:CheckSupplierAvailabilityRequest>`;

    const result = await callSoapService("checkSupplierAvailability", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        container.innerHTML = `
            <div class="supplier-error">
                ⚠️ Supplier information is temporarily unavailable.
            </div>
        `;
        showResult("Supplier information is temporarily unavailable.", "error", "Supplier Check");
        return;
    }

    const responseNode = getXmlNode(result.xmlDoc, "CheckSupplierAvailabilityResponse");
    const supplierName = getXmlValue(responseNode, "supplierName") || "Supplier";
    const availableQuantity = parseInt(getXmlValue(responseNode, "availableQuantity") || "0", 10);
    const supplierPrice = parseFloat(getXmlValue(responseNode, "supplierPrice") || "0.0");
    const available = getXmlValue(responseNode, "available").toLowerCase() === "true";

    container.innerHTML = "";

    const card = document.createElement("div");
    card.className = "supplier-card " + (available ? "supplier-available" : "supplier-unavailable");

    const header = document.createElement("div");
    header.className = "supplier-card-header";

    const titleGroup = document.createElement("div");
    const badge = document.createElement("span");
    badge.className = "supplier-status-badge " + (available ? "badge-avail" : "badge-unavail");
    badge.textContent = available ? "✔ Supplier Available" : "✖ Supplier Information Unavailable";

    const title = document.createElement("h4");
    title.className = "supplier-card-title";
    title.textContent = supplierName;

    titleGroup.appendChild(badge);
    titleGroup.appendChild(title);

    header.appendChild(titleGroup);

    const grid = document.createElement("div");
    grid.className = "supplier-grid";

    grid.appendChild(createSupplierStat("Product ID", "#" + productId));
    grid.appendChild(createSupplierStat("Available Quantity", available ? (availableQuantity + " units") : "Unavailable"));
    grid.appendChild(createSupplierStat("Wholesale Price", available && supplierPrice > 0 ? ("₹" + supplierPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : "Estimated Cost Unavailable"));
    grid.appendChild(createSupplierStat("Status", available ? "Supplier Available" : "Supplier Information Unavailable"));

    card.appendChild(header);
    card.appendChild(grid);

    container.appendChild(card);
    showResult(`Supplier status received for #${productId}: ${available ? "Supplier Available" : "Supplier Information Unavailable"}`, available ? "success" : "info", "Supplier Check");
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
// 6. SOAP Operation: getProductExternalInfo (Multi-Service Orchestration)
// Coordinates: AWS RDS PostgreSQL + Supplier Service + Frankfurter + Open-Meteo
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
            <span>Retrieving comprehensive product details...</span>
        </div>
    `;

    // Construct SOAP 1.1 GetProductExternalInfoRequest payload
    const soapPayload = `
        <inv:GetProductExternalInfoRequest>
            <inv:id>${productId}</inv:id>
        </inv:GetProductExternalInfoRequest>`;

    const result = await callSoapService("getProductExternalInfo", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "Service communication failure.";
        container.innerHTML = `
            <div class="external-error-box">
                <span class="err-icon">⚠️</span>
                <div>
                    <strong>Query Notice:</strong> ${escapeXml(errorMsg)}
                </div>
            </div>
        `;
        showResult(errorMsg, "error", "Query Error");
        return;
    }

    // Parse GetProductExternalInfoResponse
    const responseNode = getXmlNode(result.xmlDoc, "GetProductExternalInfoResponse");
    const success = getXmlValue(responseNode, "success").toLowerCase() === "true";
    const message = getXmlValue(responseNode, "message");

    if (!success) {
        container.innerHTML = `
            <div class="external-error-box">
                <span class="err-icon">⚠️</span>
                <div>
                    <strong>Result:</strong> ${escapeXml(message || "Product not found")}
                </div>
            </div>
        `;
        showResult(message || "Product not found", "error", "Product Query");
        return;
    }

    // Extract Product Data
    const prodNode = getXmlNode(responseNode, "product");
    const prodId = getXmlValue(prodNode, "id") || productId;
    const prodName = getXmlValue(prodNode, "name") || "N/A";
    const prodQuantity = getXmlValue(prodNode, "quantity") || "0";
    const prodPrice = parseFloat(getXmlValue(prodNode, "price") || "0.0");
    const prodCategory = getXmlValue(prodNode, "category") || "N/A";

    // Extract Supplier Data
    const supNode = getXmlNode(responseNode, "supplierInfo");
    const supName = getXmlValue(supNode, "supplierName") || "N/A";
    const supQuantity = getXmlValue(supNode, "availableQuantity") || "0";
    const supPrice = parseFloat(getXmlValue(supNode, "supplierPrice") || "0.0");
    const supAvailable = getXmlValue(supNode, "available").toLowerCase() === "true";
    const supStatus = getXmlValue(supNode, "status") || (supAvailable ? "AVAILABLE" : "UNAVAILABLE");

    // Extract Currency Data
    const curNode = getXmlNode(responseNode, "currencyInfo");
    const baseCur = getXmlValue(curNode, "baseCurrency") || "EUR";
    const targetCur = getXmlValue(curNode, "targetCurrency") || "USD";
    const exRate = getXmlValue(curNode, "exchangeRate") || "N/A";
    const convertedPrice = parseFloat(getXmlValue(curNode, "convertedPrice") || "0.0");
    const curStatus = getXmlValue(curNode, "status") || "OK";

    // Extract Weather Data
    const wtrNode = getXmlNode(responseNode, "weatherInfo");
    const wtrLoc = getXmlValue(wtrNode, "location") || "Distribution Hub";
    const wtrTemp = getXmlValue(wtrNode, "temperature") || "0.0";
    const wtrWind = getXmlValue(wtrNode, "windSpeed") || "0.0";
    const wtrCond = getXmlValue(wtrNode, "weatherCondition") || "N/A";
    const wtrStatus = getXmlValue(wtrNode, "status") || "OK";

    // Build the structured display
    container.innerHTML = "";

    const extWrapper = document.createElement("div");
    extWrapper.className = "external-intel-wrapper";

    extWrapper.innerHTML = `
        <!-- HEADER TITLE -->
        <div class="ext-intel-header">
            <div class="ext-intel-title-row">
                <span class="ext-pulse-dot"></span>
                <span class="ext-main-title">Comprehensive Product Information</span>
            </div>
            <p class="ext-intel-desc">Combined inventory catalog, wholesale supplier, currency, and operational facility status</p>
        </div>

        <!-- 4 SERVICE CARDS -->
        <div class="external-quad-grid">

            <!-- 1. PRODUCT DATA -->
            <div class="external-card card-database">
                <div class="ext-card-header">
                    <span class="ext-icon">🗄️</span>
                    <div>
                        <h4 class="ext-title">Catalog Inventory</h4>
                        <span class="ext-source">Internal Database</span>
                    </div>
                </div>
                <div class="ext-card-body">
                    <div class="ext-stat-row"><span>Product ID:</span> <strong>#${escapeXml(prodId)}</strong></div>
                    <div class="ext-stat-row"><span>Name:</span> <strong>${escapeXml(prodName)}</strong></div>
                    <div class="ext-stat-row"><span>Quantity:</span> <strong>${escapeXml(prodQuantity)} units</strong></div>
                    <div class="ext-stat-row"><span>Price:</span> <strong>₹${prodPrice.toLocaleString("en-IN", {minimumFractionDigits: 2})}</strong></div>
                    <div class="ext-stat-row"><span>Category:</span> <strong>${escapeXml(prodCategory)}</strong></div>
                </div>
            </div>

            <!-- 2. SUPPLIER SERVICE -->
            <div class="external-card ${supAvailable ? 'card-supplier-avail' : 'card-supplier-unavail'}">
                <div class="ext-card-header">
                    <span class="ext-icon">🏢</span>
                    <div>
                        <h4 class="ext-title">Supplier Information</h4>
                        <span class="ext-source">Wholesale Supplier</span>
                    </div>
                </div>
                <div class="ext-card-body">
                    <div class="ext-stat-row"><span>Supplier:</span> <strong>${escapeXml(supName)}</strong></div>
                    <div class="ext-stat-row"><span>Available Quantity:</span> <strong>${supAvailable ? escapeXml(supQuantity) + ' units' : 'Unavailable'}</strong></div>
                    <div class="ext-stat-row"><span>Wholesale Price:</span> <strong>${supAvailable && supPrice > 0 ? '₹' + supPrice.toLocaleString("en-IN", {minimumFractionDigits: 2}) : 'Unavailable'}</strong></div>
                    <div class="ext-stat-row"><span>Availability:</span> <span class="ext-badge ${supAvailable ? 'badge-success-ext' : 'badge-danger-ext'}">${supAvailable ? 'Supplier Available' : 'Supplier Information Unavailable'}</span></div>
                    <div class="ext-stat-status">${supAvailable ? 'Active Supplier' : 'Unavailable'}</div>
                </div>
            </div>

            <!-- 3. CURRENCY SERVICE -->
            <div class="external-card card-currency">
                <div class="ext-card-header">
                    <span class="ext-icon">💱</span>
                    <div>
                        <h4 class="ext-title">Currency Pricing</h4>
                        <span class="ext-source">Live Rates</span>
                    </div>
                </div>
                <div class="ext-card-body">
                    <div class="ext-stat-row"><span>Exchange Pair:</span> <strong>${escapeXml(baseCur)} → ${escapeXml(targetCur)}</strong></div>
                    <div class="ext-stat-row"><span>Exchange Rate:</span> <strong>${escapeXml(exRate)}</strong></div>
                    <div class="ext-stat-row"><span>Converted Price:</span> <strong>${parseFloat(exRate) > 0 ? '$' + convertedPrice.toLocaleString("en-US", {minimumFractionDigits: 2}) + ' ' + escapeXml(targetCur) : '<span style="color: var(--text-muted);">Estimated Cost Unavailable</span>'}</strong></div>
                    <div class="ext-stat-status">${escapeXml(curStatus)}</div>
                </div>
            </div>

            <!-- 4. WEATHER SERVICE -->
            <div class="external-card card-weather">
                <div class="ext-card-header">
                    <span class="ext-icon">🌤️</span>
                    <div>
                        <h4 class="ext-title">Facility Weather</h4>
                        <span class="ext-source">Local Forecast</span>
                    </div>
                </div>
                <div class="ext-card-body">
                    <div class="ext-stat-row"><span>Location:</span> <strong>${escapeXml(wtrLoc)}</strong></div>
                    <div class="ext-stat-row"><span>Temperature:</span> <strong>${escapeXml(wtrTemp)}°C</strong></div>
                    <div class="ext-stat-row"><span>Wind Speed:</span> <strong>${escapeXml(wtrWind)} km/h</strong></div>
                    <div class="ext-stat-row"><span>Condition:</span> <strong>${escapeXml(wtrCond)}</strong></div>
                    <div class="ext-stat-status">${escapeXml(wtrStatus)}</div>
                </div>
            </div>

        </div>
    `;

    container.appendChild(extWrapper);

    showResult("Product details retrieved successfully.", "success", "Product Information");

    // Also update SOAP response card
    renderSoapResponseCard(
        "getProductExternalInfo",
        "SUCCESS",
        "Product data retrieved successfully",
        { id: prodId, name: prodName, quantity: prodQuantity, price: prodPrice, category: prodCategory },
        result.rawXml
    );

    if (idInput) idInput.value = "";
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
// DOM Rendering: Display Product Details
// --------------------------------------------------------------------------
function displayProduct(product) {
    const container = document.getElementById("productDetails");
    if (!container) return;

    container.innerHTML = "";

    const cardView = document.createElement("div");
    cardView.className = "product-card-view";

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

    const actions = document.createElement("div");
    actions.className = "product-quick-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary btn-sm";
    editBtn.textContent = "✏️ Edit Product";
    editBtn.onclick = () => {
        closeModal("modal-details");
        loadProductToUpdate(product.id);
    };

    const adjustBtn = document.createElement("button");
    adjustBtn.type = "button";
    adjustBtn.className = "btn btn-secondary btn-sm";
    adjustBtn.textContent = "⚖️ Adjust Stock";
    adjustBtn.onclick = () => {
        closeModal("modal-details");
        loadProductToAdjust(product.id);
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger btn-sm";
    deleteBtn.textContent = "🗑️ Delete";
    deleteBtn.onclick = () => {
        closeModal("modal-details");
        loadProductToDelete(product.id);
    };

    const supplierBtn = document.createElement("button");
    supplierBtn.type = "button";
    supplierBtn.className = "btn btn-info btn-sm";
    supplierBtn.textContent = "🏢 Supplier Info";
    supplierBtn.onclick = () => {
        checkSupplierAvailability(product.id);
    };

    actions.appendChild(editBtn);
    actions.appendChild(adjustBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(supplierBtn);
    cardView.appendChild(actions);

    const supplierContainer = document.createElement("div");
    supplierContainer.id = "supplierDetailsContainer";
    supplierContainer.className = "supplier-details-container";
    cardView.appendChild(supplierContainer);

    container.appendChild(cardView);

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
    desc.textContent = "Select a product from the inventory table to view details.";

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
// Status Notification Toast
// --------------------------------------------------------------------------
let toastTimer = null;

function showResult(message, type = "info", title = "") {
    const resultEl = document.getElementById("result");
    if (!resultEl) return;

    if (toastTimer) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }

    if (message && message.startsWith("Dispatching SOAP")) {
        return;
    }

    let iconText = "ℹ️";
    let defaultTitle = "Notice";

    if (type === "success") {
        iconText = "✅";
        defaultTitle = "Success";
    } else if (type === "error") {
        iconText = "⚠️";
        defaultTitle = "Error";
    } else if (type === "warning") {
        iconText = "⚠️";
        defaultTitle = "Warning";
    }

    let cleanTitle = title;
    if (!cleanTitle || cleanTitle.includes("SOAP")) {
        cleanTitle = defaultTitle;
    }

    resultEl.className = "result-toast result-" + type;
    resultEl.style.display = "flex";

    resultEl.innerHTML = `
        <span class="result-icon">${iconText}</span>
        <div class="result-body">
            <span class="result-title">${escapeXml(cleanTitle)}</span>
            <span class="result-message">${escapeXml(message)}</span>
        </div>
        <button type="button" class="toast-close" onclick="closeToast()">&times;</button>
    `;

    const timeout = type === "error" ? 6000 : 4000;
    toastTimer = setTimeout(() => {
        closeToast();
    }, timeout);
}

function closeToast() {
    const resultEl = document.getElementById("result");
    if (resultEl) {
        resultEl.style.display = "none";
    }
}

// --------------------------------------------------------------------------
// Statistics & Overview Dashboard Widgets
// --------------------------------------------------------------------------
function updateStatistics(lastOpText) {
    const totalCount = productCache.size;
    let totalQuantity = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockItems = [];

    productCache.forEach(product => {
        const qty = Number(product.quantity) || 0;
        totalQuantity += qty;
        totalValue += qty * (Number(product.price) || 0);

        if (qty === 0) {
            outOfStockCount++;
            lowStockItems.push(product);
        } else if (qty < LOW_STOCK_THRESHOLD) {
            lowStockCount++;
            lowStockItems.push(product);
        }
    });

    const statCountEl = document.getElementById("statTotalProducts");
    if (statCountEl) statCountEl.textContent = totalCount;

    const statQtyEl = document.getElementById("statTotalQuantity");
    if (statQtyEl) statQtyEl.textContent = totalQuantity.toLocaleString("en-IN");

    const statLowEl = document.getElementById("statLowStock");
    if (statLowEl) statLowEl.textContent = lowStockCount;

    const statOutEl = document.getElementById("statOutOfStock");
    if (statOutEl) statOutEl.textContent = outOfStockCount;

    // Overview Low Stock Alert Banner
    const alertBanner = document.getElementById("overviewLowStockAlert");
    const alertTitle = document.getElementById("overviewAlertTitle");
    const alertMsg = document.getElementById("overviewAlertMessage");
    if (alertBanner) {
        if (lowStockCount > 0 || outOfStockCount > 0) {
            alertBanner.style.display = "flex";
            if (alertTitle) alertTitle.textContent = "Low Stock Attention Needed:";
            if (alertMsg) {
                alertMsg.textContent = `${outOfStockCount} item(s) are completely out of stock and ${lowStockCount} item(s) are below safety threshold (< ${LOW_STOCK_THRESHOLD} units).`;
            }
        } else {
            alertBanner.style.display = "none";
        }
    }

    renderOverviewLowStockWidget(lowStockItems);

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

function renderOverviewLowStockWidget(items) {
    const container = document.getElementById("overviewLowStockContainer");
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="table-empty-state" style="padding: 24px;">
                <div class="table-empty-icon" style="font-size: 28px;">✅</div>
                <h4 style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">Healthy Inventory</h4>
                <p style="font-size: 13px; color: var(--text-muted);">All items in your catalog are currently above minimum safety thresholds.</p>
            </div>
        `;
        return;
    }

    let html = '<div class="widget-list">';
    items.slice(0, 5).forEach(p => {
        const isOut = p.quantity === 0;
        const badge = isOut
            ? '<span class="stock-badge badge-out-of-stock">Out of Stock</span>'
            : `<span class="stock-badge badge-low-stock">${p.quantity} units</span>`;

        html += `
            <div class="widget-item">
                <div class="widget-item-left">
                    <div>
                        <div class="widget-item-title">${escapeXml(p.name)}</div>
                        <div class="widget-item-subtitle">ID #${p.id} • ${escapeXml(p.category)}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${badge}
                    <button type="button" class="table-action-btn" onclick="loadProductToAdjust(${p.id})">
                        ⚖️ Adjust
                    </button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function renderOverviewRecentActivityWidget(movements) {
    const container = document.getElementById("overviewRecentActivityContainer");
    if (!container) return;

    if (!movements || movements.length === 0) {
        container.innerHTML = `
            <div class="table-empty-state" style="padding: 24px;">
                <div class="table-empty-icon" style="font-size: 28px;">📋</div>
                <h4 style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">No Recent Movements</h4>
                <p style="font-size: 13px; color: var(--text-muted);">Stock transactions will appear here as inventory changes occur.</p>
            </div>
        `;
        return;
    }

    let html = '<div class="widget-list">';
    movements.slice(0, 5).forEach(m => {
        let typeLabel = "Adjusted";
        let typeBadgeClass = "badge-stock-adjust";
        if (m.movementType === "STOCK_IN") {
            typeLabel = "Stock Added";
            typeBadgeClass = "badge-stock-in";
        } else if (m.movementType === "STOCK_OUT") {
            typeLabel = m.reference === "DELETE_PRODUCT" ? "Product Deleted" : "Stock Removed";
            typeBadgeClass = "badge-stock-out";
        }

        const changeSign = m.quantityChange > 0 ? "+" + m.quantityChange : "" + m.quantityChange;

        html += `
            <div class="widget-item">
                <div class="widget-item-left">
                    <div>
                        <div class="widget-item-title">${escapeXml(m.productName || 'Product #' + m.productId)}</div>
                        <div class="widget-item-subtitle">${m.reason ? escapeXml(m.reason) : typeLabel}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="badge-movement ${typeBadgeClass}">${typeLabel}</span>
                    <span style="font-weight: 600; font-size: 13px;">${changeSign}</span>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
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
// 7. SOAP Operation: getAllProducts (POST /ws -> GetAllProductsRequest)
// Synchronizes frontend productCache and Dashboard with backend database
// --------------------------------------------------------------------------
async function fetchAllProducts(isManualRefresh = false, operationContext = null) {
    const tableContainer = document.getElementById("inventoryTableContainer");
    const countPill = document.getElementById("tableProductCount");

    if (tableContainer && (!productCache || productCache.size === 0)) {
        tableContainer.innerHTML = `
            <div class="table-loading">
                <span class="supplier-spinner">🔄</span>
                <span>Loading inventory...</span>
            </div>
        `;
    }

    const soapPayload = `<inv:GetAllProductsRequest/>`;

    const result = await callSoapService("getAllProducts", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "Communication failure while loading inventory.";
        if (tableContainer) {
            tableContainer.innerHTML = `
                <div class="table-empty-state">
                    <div class="table-empty-icon">⚠️</div>
                    <h3 class="table-empty-title">Failed to Load Inventory</h3>
                    <p class="table-empty-desc">${escapeXml(errorMsg)}</p>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="fetchAllProducts(true)">
                        🔄 Retry Connection
                    </button>
                </div>
            `;
        }
        showResult(errorMsg, "error", "Inventory Load");
        if (isManualRefresh) {
            renderSoapResponseCard("getAllProducts", "FAULT", errorMsg, null, result.rawXml);
        }
        return;
    }

    // Parse GetAllProductsResponse
    const responseNode = getXmlNode(result.xmlDoc, "GetAllProductsResponse");

    // Clear cache before loading fresh synchronized state
    productCache.clear();

    if (responseNode) {
        // Support both <products> and <product> tag naming
        let productNodes = responseNode.getElementsByTagNameNS(SOAP_NAMESPACE, "products");
        if (!productNodes || productNodes.length === 0) {
            productNodes = responseNode.getElementsByTagName("products");
        }
        if (!productNodes || productNodes.length === 0) {
            productNodes = responseNode.getElementsByTagNameNS(SOAP_NAMESPACE, "product");
        }
        if (!productNodes || productNodes.length === 0) {
            productNodes = responseNode.getElementsByTagName("product");
        }

        for (let i = 0; i < productNodes.length; i++) {
            const node = productNodes[i];
            const idVal = getXmlValue(node, "id");
            if (idVal) {
                const product = {
                    id: parseInt(idVal, 10),
                    name: getXmlValue(node, "name"),
                    quantity: parseInt(getXmlValue(node, "quantity") || "0", 10),
                    price: parseFloat(getXmlValue(node, "price") || "0.0"),
                    category: getXmlValue(node, "category")
                };
                if (!isNaN(product.id)) {
                    productCache.set(product.id, product);
                }
            }
        }
    }

    // Update real persisted dashboard statistics
    const lastOpLabel = operationContext || (isManualRefresh ? "Refreshed (" + productCache.size + ")" : "Synchronized");
    updateStatistics(lastOpLabel);

    // Render table and smart restocking
    renderInventoryTable();
    renderSmartRestocking();

    if (isManualRefresh) {
        showResult(`Loaded ${productCache.size} products from catalog.`, "success", "Inventory Synced");
        renderSoapResponseCard("getAllProducts", "SUCCESS", `Retrieved ${productCache.size} persisted products from database`, null, result.rawXml);
    }
}

// --------------------------------------------------------------------------
// Inventory Overview Table Renderer
// --------------------------------------------------------------------------
function renderInventoryTable() {
    const tableContainer = document.getElementById("inventoryTableContainer");
    const countPill = document.getElementById("tableProductCount");
    if (!tableContainer) return;

    if (countPill) {
        countPill.textContent = `${productCache.size} ${productCache.size === 1 ? 'item' : 'items'}`;
    }

    // Convert map to sorted array
    let products = Array.from(productCache.values()).sort((a, b) => a.id - b.id);

    // Apply Low Stock Filter
    const lowStockToggle = document.getElementById("filterLowStockToggle");
    const isLowStockOnly = lowStockToggle && lowStockToggle.checked;
    if (isLowStockOnly) {
        products = products.filter(p => p.quantity < LOW_STOCK_THRESHOLD);
    }

    // Apply Search Filter
    const searchInput = document.getElementById("inventorySearchInput");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    if (query) {
        products = products.filter(p =>
            String(p.id).includes(query) ||
            (p.name && p.name.toLowerCase().includes(query)) ||
            (p.category && p.category.toLowerCase().includes(query))
        );
    }

    // Empty state
    if (products.length === 0) {
        if (productCache.size === 0) {
            tableContainer.innerHTML = `
                <div class="table-empty-state">
                    <div class="table-empty-icon">📦</div>
                    <h3 class="table-empty-title">No Products in Catalog</h3>
                    <p class="table-empty-desc">Your inventory catalog is currently empty. Add your first product to get started.</p>
                    <button type="button" class="btn btn-primary btn-sm" onclick="openModal('modal-add')">
                        ➕ Add First Product
                    </button>
                </div>
            `;
        } else {
            tableContainer.innerHTML = `
                <div class="table-empty-state">
                    <div class="table-empty-icon">🔍</div>
                    <h3 class="table-empty-title">No Matching Products</h3>
                    <p class="table-empty-desc">No products match your current search/filter criteria (${isLowStockOnly ? 'Low Stock' : ''} "${escapeXml(query)}").</p>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="clearInventoryFilters()">
                        Reset Filters
                    </button>
                </div>
            `;
        }
        return;
    }

    // Build table HTML
    let tableHtml = `
        <table class="inventory-table">
            <thead>
                <tr>
                    <th style="width: 80px;">ID</th>
                    <th>Product Name</th>
                    <th>Category</th>
                    <th style="text-align: right; width: 110px;">Quantity</th>
                    <th style="text-align: right; width: 130px;">Price (₹)</th>
                    <th style="text-align: center; width: 160px;">Stock Status</th>
                    <th style="text-align: right; width: 180px;">Actions</th>
                </tr>
            </thead>
            <tbody>
    `;

    products.forEach(p => {
        const isOutOfStock = p.quantity <= 0;
        const isLowStock = !isOutOfStock && p.quantity < LOW_STOCK_THRESHOLD;

        let rowClass = "";
        let statusBadge = "";

        if (isOutOfStock) {
            rowClass = "table-row-out-of-stock";
            statusBadge = `<span class="stock-badge badge-out-of-stock">✖ Out of Stock (0)</span>`;
        } else if (isLowStock) {
            rowClass = "table-row-low-stock";
            statusBadge = `<span class="stock-badge badge-low-stock">⚠️ Low Stock (${p.quantity})</span>`;
        } else {
            statusBadge = `<span class="stock-badge badge-in-stock">✔ In Stock (${p.quantity})</span>`;
        }

        const formattedPrice = "₹" + Number(p.price).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        tableHtml += `
            <tr class="${rowClass}">
                <td class="col-id">#${p.id}</td>
                <td class="col-name">${escapeXml(p.name)}</td>
                <td class="col-category">${escapeXml(p.category)}</td>
                <td class="col-qty">${p.quantity}</td>
                <td class="col-price">${formattedPrice}</td>
                <td class="col-status">${statusBadge}</td>
                <td class="col-actions">
                    <button type="button" class="table-action-btn" title="View details" onclick="selectProductFromTable(${p.id})">
                        Details
                    </button>
                    <button type="button" class="table-action-btn" title="Edit product" onclick="loadProductToUpdate(${p.id})">
                        Edit
                    </button>
                    <button type="button" class="table-action-btn" title="Adjust stock" onclick="loadProductToAdjust(${p.id})">
                        Adjust
                    </button>
                    <button type="button" class="table-action-btn table-action-btn-danger" title="Delete product" onclick="loadProductToDelete(${p.id})">
                        Delete
                    </button>
                </td>
            </tr>
        `;
    });

    tableHtml += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = tableHtml;
}

function selectProductFromTable(productId) {
    const product = productCache.get(productId);
    if (product) {
        displayProduct(product);
        prefillUpdateForm(product);
        openModal("modal-details");
    }
}

function loadProductToUpdate(productId) {
    const product = productCache.get(productId);
    if (product) {
        displayProduct(product);
        prefillUpdateForm(product);
        openModal("modal-update");
    }
}

function loadProductToDelete(productId) {
    const product = productCache.get(productId);
    const idEl = document.getElementById("deleteId");
    if (idEl) idEl.value = productId;
    const nameEl = document.getElementById("deleteProductName");
    if (nameEl && product) {
        nameEl.textContent = `#${product.id} - ${product.name} (${product.quantity} units in stock)`;
    }
    openModal("modal-delete");
}

function toggleLowStockFilter() {
    renderInventoryTable();
}

function filterInventoryTable() {
    renderInventoryTable();
}

function clearInventoryFilters() {
    const toggle = document.getElementById("filterLowStockToggle");
    if (toggle) toggle.checked = false;
    const input = document.getElementById("inventorySearchInput");
    if (input) input.value = "";
    renderInventoryTable();
}

function scrollToInventoryTable() {
    navigateTo("products");
}

// --------------------------------------------------------------------------
// Milestone 2: Stock Adjustment & Movement History Functions
// --------------------------------------------------------------------------

function onAdjustModeChange() {
    const mode = document.getElementById("adjustMode").value;
    const label = document.getElementById("adjustQuantityLabel");
    const hint = document.getElementById("adjustQuantityHint");
    const input = document.getElementById("adjustQuantity");

    if (mode === "target") {
        if (label) label.innerHTML = `Target Quantity (Absolute Stock Level) <span class="required">*</span>`;
        if (hint) hint.textContent = "Specify the exact desired final stock quantity (must be 0 or greater).";
        if (input) {
            input.placeholder = "e.g. 50";
            input.min = "0";
        }
    } else {
        if (label) label.innerHTML = `Quantity Change (e.g. +5 or -3) <span class="required">*</span>`;
        if (hint) hint.textContent = "Enter positive number to add stock, negative to deduct stock.";
        if (input) {
            input.placeholder = "e.g. 5 or -2";
            input.removeAttribute("min");
        }
    }
}

function clearAdjustForm() {
    const idEl = document.getElementById("adjustId");
    const modeEl = document.getElementById("adjustMode");
    const qtyEl = document.getElementById("adjustQuantity");
    const reasonEl = document.getElementById("adjustReason");
    const refEl = document.getElementById("adjustReference");

    if (idEl) idEl.value = "";
    if (modeEl) {
        modeEl.value = "change";
        onAdjustModeChange();
    }
    if (qtyEl) qtyEl.value = "";
    if (reasonEl) reasonEl.value = "";
    if (refEl) refEl.value = "";
}

function loadProductToAdjust(productId) {
    const product = productCache.get(productId);
    if (product) {
        displayProduct(product);
        const idEl = document.getElementById("adjustId");
        if (idEl) idEl.value = product.id;
        openModal("modal-adjust");
    }
}

async function adjustStock() {
    const idRaw = document.getElementById("adjustId").value.trim();
    const mode = document.getElementById("adjustMode").value;
    const qtyRaw = document.getElementById("adjustQuantity").value.trim();
    const reason = document.getElementById("adjustReason").value.trim();
    const reference = document.getElementById("adjustReference").value.trim();

    // Validation
    if (!idRaw || isNaN(idRaw) || parseInt(idRaw, 10) <= 0) {
        showResult("Please enter a valid positive Product ID for stock adjustment.", "error", "Validation Error");
        return;
    }
    const productId = parseInt(idRaw, 10);

    if (qtyRaw === "" || isNaN(qtyRaw)) {
        showResult("Please specify a valid quantity value.", "error", "Validation Error");
        return;
    }
    const qtyNum = parseInt(qtyRaw, 10);

    if (!reason) {
        showResult("An audit reason/note is required for stock adjustments.", "error", "Validation Error");
        return;
    }

    let soapPayload = `<inv:AdjustStockRequest>
        <inv:productId>${productId}</inv:productId>
`;

    if (mode === "target") {
        if (qtyNum < 0) {
            showResult("Target quantity cannot be negative.", "error", "Validation Error");
            return;
        }
        soapPayload += `        <inv:targetQuantity>${qtyNum}</inv:targetQuantity>
`;
    } else {
        if (qtyNum === 0) {
            showResult("Quantity change cannot be zero. Specify a positive or negative change.", "error", "Validation Error");
            return;
        }
        soapPayload += `        <inv:quantityChange>${qtyNum}</inv:quantityChange>
`;
    }

    soapPayload += `        <inv:reason>${escapeXml(reason)}</inv:reason>
`;
    if (reference) {
        soapPayload += `        <inv:reference>${escapeXml(reference)}</inv:reference>
`;
    }
    soapPayload += `    </inv:AdjustStockRequest>`;

    showResult(`Submitting stock adjustment for Product #${productId}...`, "info", "Stock Adjustment");

    const result = await callSoapService("adjustStock", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "Failed to adjust stock. Please check your connection.";
        showResult(errorMsg, "error", "Stock Adjustment");
        renderSoapResponseCard("adjustStock", "FAULT", errorMsg, null, result.rawXml);
        return;
    }

    const responseNode = getXmlNode(result.xmlDoc, "AdjustStockResponse");
    const successStr = getXmlValue(responseNode, "success");
    const isSuccess = successStr.toLowerCase() === "true";
    const message = getXmlValue(responseNode, "message") || (isSuccess ? "Stock adjusted successfully" : "Failed to adjust stock");
    const updatedQuantityStr = getXmlValue(responseNode, "updatedQuantity");
    const updatedQuantity = updatedQuantityStr ? parseInt(updatedQuantityStr, 10) : null;

    if (isSuccess) {
        closeModal("modal-adjust");
        showResult(message || "Stock adjusted successfully.", "success", "Stock Adjusted");
        renderSoapResponseCard("adjustStock", "SUCCESS", message, {
            id: productId,
            quantity: updatedQuantity !== null ? updatedQuantity : "Updated"
        }, result.rawXml);

        clearAdjustForm();

        // Immediately update productCache and UI if new quantity is known
        if (updatedQuantity !== null && productCache.has(productId)) {
            const prod = productCache.get(productId);
            prod.quantity = updatedQuantity;
            productCache.set(productId, prod);
            renderInventoryTable();
            renderSmartRestocking();
            updateStatistics(`Adjusted #${productId} -> ${updatedQuantity} units`);
        }

        // Refresh all products via SOAP getAllProducts
        await fetchAllProducts(false, `Adjusted #${productId} -> ${updatedQuantity} units`);

        // Refresh stock movements via SOAP getStockMovements
        await fetchStockMovements(false);

        // If product was currently selected in detail card, refresh it
        const currentProd = productCache.get(productId);
        if (currentProd) {
            displayProduct(currentProd);
        }
    } else {
        showResult(message, "error", "Adjustment Failed");
        renderSoapResponseCard("adjustStock", "FAILED", message, { id: productId }, result.rawXml);
    }
}

let currentMovementFilterProductId = null;

async function fetchStockMovements(isManualRefresh = false) {
    const container = document.getElementById("movementsTableContainer");
    const countPill = document.getElementById("movementsCountPill");

    if (container && (!container.children || container.children.length === 0 || isManualRefresh)) {
        container.innerHTML = `
            <div class="table-loading">
                <span class="supplier-spinner">🔄</span>
                <span>Loading stock movement history...</span>
            </div>
        `;
    }

    let soapPayload = `<inv:GetStockMovementsRequest>`;
    if (currentMovementFilterProductId) {
        soapPayload += `<inv:productId>${currentMovementFilterProductId}</inv:productId>`;
    }
    soapPayload += `<inv:maxRecords>100</inv:maxRecords>`;
    soapPayload += `</inv:GetStockMovementsRequest>`;

    const result = await callSoapService("getStockMovements", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "Communication failure while loading stock movements.";
        if (container) {
            container.innerHTML = `
                <div class="table-empty-state">
                    <div class="table-empty-icon">⚠️</div>
                    <h3 class="table-empty-title">Failed to Load Movement History</h3>
                    <p class="table-empty-desc">${escapeXml(errorMsg)}</p>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="fetchStockMovements(true)">
                        🔄 Retry Connection
                    </button>
                </div>
            `;
        }
        if (isManualRefresh) {
            showResult(errorMsg, "error", "Movement History");
            renderSoapResponseCard("getStockMovements", "FAULT", errorMsg, null, result.rawXml);
        }
        return;
    }

    const responseNode = getXmlNode(result.xmlDoc, "GetStockMovementsResponse");
    const movements = [];

    if (responseNode) {
        let nodes = responseNode.getElementsByTagNameNS(SOAP_NAMESPACE, "movements");
        if (!nodes || nodes.length === 0) {
            nodes = responseNode.getElementsByTagName("movements");
        }
        if (!nodes || nodes.length === 0) {
            nodes = responseNode.getElementsByTagNameNS(SOAP_NAMESPACE, "movement");
        }
        if (!nodes || nodes.length === 0) {
            nodes = responseNode.getElementsByTagName("movement");
        }

        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const idVal = getXmlValue(node, "id");
            if (idVal) {
                movements.push({
                    id: parseInt(idVal, 10),
                    productId: parseInt(getXmlValue(node, "productId") || "0", 10),
                    productName: getXmlValue(node, "productName"),
                    movementType: getXmlValue(node, "movementType"),
                    previousQuantity: parseInt(getXmlValue(node, "previousQuantity") || "0", 10),
                    newQuantity: parseInt(getXmlValue(node, "newQuantity") || "0", 10),
                    quantityChange: parseInt(getXmlValue(node, "quantityChange") || "0", 10),
                    reason: getXmlValue(node, "reason"),
                    timestamp: getXmlValue(node, "timestamp"),
                    reference: getXmlValue(node, "reference")
                });
            }
        }
    }

    renderStockMovementsTable(movements);

    if (isManualRefresh) {
        showResult(`Loaded ${movements.length} stock movement records.`, "success", "Movement History");
        renderSoapResponseCard("getStockMovements", "SUCCESS", `Loaded ${movements.length} persistent movement audit records`, null, result.rawXml);
    }
}

function renderStockMovementsTable(movements) {
    const container = document.getElementById("movementsTableContainer");
    const countPill = document.getElementById("movementsCountPill");
    if (!container) return;

    if (countPill) {
        countPill.textContent = `${movements.length} ${movements.length === 1 ? 'record' : 'records'}`;
    }

    if (!movements || movements.length === 0) {
        container.innerHTML = `
            <div class="table-empty-state">
                <div class="table-empty-icon">📜</div>
                <h3 class="table-empty-title">No Stock Movement History Found</h3>
                <p class="table-empty-desc">${currentMovementFilterProductId ? `No stock movements recorded for Product #${currentMovementFilterProductId}.` : 'Stock movements will appear here when products are added, updated, or adjusted.'}</p>
                ${currentMovementFilterProductId ? `
                    <button type="button" class="btn btn-secondary btn-sm" onclick="clearMovementFilter()">
                        Clear Product Filter
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }

    let tableHtml = `
        <table class="movements-table">
            <thead>
                <tr>
                    <th style="width: 160px;">Date & Time</th>
                    <th>Product</th>
                    <th style="width: 140px;">Movement Type</th>
                    <th style="text-align: right; width: 90px;">Previous</th>
                    <th style="text-align: center; width: 90px;">Change</th>
                    <th style="text-align: right; width: 90px;">New Qty</th>
                    <th>Reason</th>
                    <th style="width: 130px;">Reference</th>
                </tr>
            </thead>
            <tbody>
    `;

    movements.forEach(m => {
        let typeBadge = "";
        if (m.movementType === "STOCK_IN") {
            typeBadge = `<span class="badge-movement badge-stock-in">Stock Added</span>`;
        } else if (m.movementType === "STOCK_OUT") {
            const isDelete = m.reference === "DELETE_PRODUCT";
            typeBadge = `<span class="badge-movement badge-stock-out">${isDelete ? 'Product Deleted' : 'Stock Removed'}</span>`;
        } else if (m.movementType === "ADJUSTMENT") {
            typeBadge = `<span class="badge-movement badge-stock-adjust">Stock Adjusted</span>`;
        } else {
            typeBadge = `<span class="badge-movement">${escapeXml(m.movementType)}</span>`;
        }

        let changeClass = "qty-change-zero";
        let changeSign = "";
        if (m.quantityChange > 0) {
            changeClass = "qty-change-pos";
            changeSign = "+" + m.quantityChange;
        } else if (m.quantityChange < 0) {
            changeClass = "qty-change-neg";
            changeSign = "" + m.quantityChange;
        } else {
            changeSign = "0";
        }

        let formattedTime = m.timestamp || "-";
        try {
            if (m.timestamp) {
                const dateObj = new Date(m.timestamp);
                if (!isNaN(dateObj.getTime())) {
                    formattedTime = dateObj.toLocaleDateString("en-IN", {
                        year: "numeric",
                        month: "short",
                        day: "numeric"
                    }) + " " + dateObj.toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit"
                    });
                }
            }
        } catch (e) {
            formattedTime = m.timestamp;
        }

        const displayName = m.productName ? escapeXml(m.productName) : "(Deleted)";

        tableHtml += `
            <tr>
                <td class="movement-timestamp">${formattedTime}</td>
                <td>
                    <div class="movement-product-tag">
                        <span class="movement-product-id">#${m.productId}</span>
                        <span>${displayName}</span>
                    </div>
                </td>
                <td>${typeBadge}</td>
                <td style="text-align: right; font-variant-numeric: tabular-nums;">${m.previousQuantity}</td>
                <td style="text-align: center;" class="${changeClass}">${changeSign}</td>
                <td style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">${m.newQuantity}</td>
                <td class="movement-reason" title="${escapeXml(m.reason || '')}">${escapeXml(m.reason || '-')}</td>
                <td>${m.reference ? `<span class="movement-ref">${escapeXml(m.reference)}</span>` : '<span style="color:var(--text-muted);">-</span>'}</td>
            </tr>
        `;
    });

    tableHtml += `
            </tbody>
        </table>
    `;

    container.innerHTML = tableHtml;
    renderOverviewRecentActivityWidget(movements);
}

let movementFilterTimeout = null;

function onMovementFilterChange() {
    clearTimeout(movementFilterTimeout);
    movementFilterTimeout = setTimeout(() => {
        const input = document.getElementById("movementProductFilter");
        const val = input ? input.value.trim() : "";
        if (val && !isNaN(val) && parseInt(val, 10) > 0) {
            currentMovementFilterProductId = parseInt(val, 10);
        } else {
            currentMovementFilterProductId = null;
        }
        fetchStockMovements(false);
    }, 300);
}

function clearMovementFilter() {
    const input = document.getElementById("movementProductFilter");
    if (input) input.value = "";
    currentMovementFilterProductId = null;
    fetchStockMovements(false);
}

function scrollToStockActivity() {
    navigateTo("activity");
}

// --------------------------------------------------------------------------
// Milestone 3: Smart Restocking & Supplier Cost Comparison Functions
// --------------------------------------------------------------------------

const RESTOCK_TARGET_STOCK = 20;
let currentRestockSelectedProductId = null;

function renderSmartRestocking() {
    const tableContainer = document.getElementById("restockTableContainer");
    const countTag = document.getElementById("restockTableCountTag");
    const kpiCandidates = document.getElementById("restockCandidatesCount");
    const kpiCritical = document.getElementById("restockCriticalCount");
    const kpiTotalUnits = document.getElementById("restockTotalUnitsCount");

    if (!tableContainer) return;

    // Filter products requiring restocking (< LOW_STOCK_THRESHOLD = 5 units)
    const allProducts = Array.from(productCache.values());
    const candidates = allProducts
        .filter(p => p.quantity < LOW_STOCK_THRESHOLD)
        .map(p => {
            const suggested = Math.max(0, RESTOCK_TARGET_STOCK - p.quantity);
            const isZero = p.quantity === 0;
            return {
                id: p.id,
                name: p.name,
                category: p.category,
                quantity: p.quantity,
                price: p.price,
                suggested: suggested,
                urgency: isZero ? "CRITICAL" : "HIGH",
                reason: isZero
                    ? `Out of Stock: 0 units remaining. Critical replenishment of ${suggested} units required to reach target (${RESTOCK_TARGET_STOCK}).`
                    : `Low Stock: Current inventory (${p.quantity}) is below safe threshold (${LOW_STOCK_THRESHOLD}). Replenish ${suggested} units to reach target (${RESTOCK_TARGET_STOCK}).`
            };
        })
        .sort((a, b) => {
            // Sort CRITICAL first, then by lowest quantity
            if (a.urgency === "CRITICAL" && b.urgency !== "CRITICAL") return -1;
            if (b.urgency === "CRITICAL" && a.urgency !== "CRITICAL") return 1;
            return a.quantity - b.quantity;
        });

    // Compute metrics
    const criticalCount = candidates.filter(c => c.urgency === "CRITICAL").length;
    const totalSuggestedUnits = candidates.reduce((sum, c) => sum + c.suggested, 0);

    if (kpiCandidates) kpiCandidates.textContent = candidates.length;
    if (kpiCritical) kpiCritical.textContent = criticalCount;
    if (kpiTotalUnits) kpiTotalUnits.textContent = totalSuggestedUnits;
    if (countTag) countTag.textContent = `${candidates.length} ${candidates.length === 1 ? 'item' : 'items'}`;

    // Update Weather Risk alert banner in Smart Restocking
    const restockWeatherAlertEl = document.getElementById("restockWeatherAlert");
    if (restockWeatherAlertEl) {
        if (currentWeatherReport && currentWeatherReport.hasAdverseWeather) {
            const topAdvisory = currentWeatherReport.advisories.find(a => a.severity === "HIGH" || a.severity === "WARNING") || currentWeatherReport.advisories[0];
            restockWeatherAlertEl.style.display = "flex";
            restockWeatherAlertEl.innerHTML = `
                <div class="restock-weather-alert-content">
                    <span style="font-size: 18px;">⚠️</span>
                    <div>
                        <strong>Weather Planning Consideration:</strong> ${escapeXml(topAdvisory.title)} (${escapeXml(topAdvisory.severity)}).
                        Adverse weather at the warehouse hub overlaps the replenishment planning horizon. Review carrier dispatch and dock readiness.
                    </div>
                </div>
                <button type="button" class="restock-weather-alert-btn" onclick="scrollToWeatherRisk()">
                    View Weather Risk Advisories ↘
                </button>
            `;
        } else {
            restockWeatherAlertEl.style.display = "none";
        }
    }

    if (candidates.length === 0) {
        tableContainer.innerHTML = `
            <div class="table-empty-state">
                <div class="table-empty-icon">✅</div>
                <h3 class="table-empty-title">All Products Sufficiently Stocked</h3>
                <p class="table-empty-desc">No products are currently below the low-stock threshold (&lt; ${LOW_STOCK_THRESHOLD} units). All catalog inventory satisfies rule-based replenishment criteria.</p>
            </div>
        `;
        const placeholder = document.getElementById("restockAnalysisPlaceholder");
        const card = document.getElementById("restockAnalysisCard");
        if (placeholder) placeholder.style.display = "flex";
        if (card) card.style.display = "none";
        return;
    }

    let html = `
        <table class="restock-table">
            <thead>
                <tr>
                    <th style="width: 70px;">ID</th>
                    <th>Product</th>
                    <th style="width: 100px;">Category</th>
                    <th style="text-align: right; width: 80px;">Stock</th>
                    <th style="width: 120px;">Urgency</th>
                    <th style="text-align: center; width: 110px;">Suggested Qty</th>
                    <th>Recommendation Reason</th>
                    <th style="text-align: right; width: 150px;">Action</th>
                </tr>
            </thead>
            <tbody>
    `;

    candidates.forEach(c => {
        const isSelected = c.id === currentRestockSelectedProductId;
        const urgencyBadge = c.urgency === "CRITICAL"
            ? `<span class="urgency-badge badge-urgency-critical">Critical Stock</span>`
            : `<span class="urgency-badge badge-urgency-high">Restock Recommended</span>`;

        const weatherChip = (currentWeatherReport && currentWeatherReport.hasAdverseWeather && c.quantity === 0)
            ? `<span class="badge-weather-warning" title="Adverse weather at distribution hub may affect replenishment">🌦️ Weather Advisory</span>`
            : '';

        html += `
            <tr id="restock-row-${c.id}" class="${isSelected ? 'selected-candidate' : ''}">
                <td>#${c.id}</td>
                <td><strong>${escapeXml(c.name)}</strong>${weatherChip}</td>
                <td>${escapeXml(c.category)}</td>
                <td style="text-align: right; font-weight: 700; color: ${c.quantity === 0 ? 'var(--danger)' : 'var(--warning)'};">${c.quantity}</td>
                <td>${urgencyBadge}</td>
                <td style="text-align: center;"><span class="suggested-qty-pill">+${c.suggested}</span></td>
                <td style="font-size: 13px; color: var(--text-secondary); max-width: 240px;" title="${escapeXml(c.reason)}">${escapeXml(c.reason)}</td>
                <td style="text-align: right;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="selectRestockCandidate(${c.id})">
                        🔍 Supplier Options
                    </button>
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    tableContainer.innerHTML = html;

    // If an active selection still exists in candidates, re-render it; else reset placeholder
    if (currentRestockSelectedProductId) {
        const stillCandidate = candidates.find(c => c.id === currentRestockSelectedProductId);
        if (!stillCandidate) {
            currentRestockSelectedProductId = null;
            const placeholder = document.getElementById("restockAnalysisPlaceholder");
            const card = document.getElementById("restockAnalysisCard");
            if (placeholder) placeholder.style.display = "flex";
            if (card) card.style.display = "none";
        }
    }
}

async function selectRestockCandidate(productId) {
    const product = productCache.get(productId);
    if (!product) return;

    navigateTo("restocking");
    currentRestockSelectedProductId = productId;

    // Highlight row in candidate table
    document.querySelectorAll(".restock-table tr").forEach(row => row.classList.remove("selected-candidate"));
    const selectedRow = document.getElementById("restock-row-" + productId);
    if (selectedRow) selectedRow.classList.add("selected-candidate");

    const placeholder = document.getElementById("restockAnalysisPlaceholder");
    const card = document.getElementById("restockAnalysisCard");

    if (placeholder) placeholder.style.display = "none";
    if (card) {
        card.style.display = "block";
        card.innerHTML = `
            <div class="table-loading">
                <span class="supplier-spinner">🔄</span>
                <span>Checking supplier availability for Product #${productId}...</span>
            </div>
        `;
    }

    const suggested = Math.max(0, RESTOCK_TARGET_STOCK - product.quantity);

    // Call SOAP checkSupplierAvailability
    const soapPayload = `<inv:CheckSupplierAvailabilityRequest>
        <inv:productId>${productId}</inv:productId>
    </inv:CheckSupplierAvailabilityRequest>`;

    const result = await callSoapService("checkSupplierAvailability", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "Supplier information is temporarily unavailable.";
        if (card) {
            card.innerHTML = `
                <div class="analysis-card-header">
                    <div>
                        <div class="analysis-prod-title">#${product.id} ${escapeXml(product.name)}</div>
                        <div class="analysis-prod-meta">Current Stock: <strong>${product.quantity}</strong> | Suggested Replenishment: <strong>+${suggested} units</strong></div>
                    </div>
                </div>
                <div class="table-empty-state" style="padding: 24px;">
                    <div class="table-empty-icon">⚠️</div>
                    <h3 class="table-empty-title">Supplier Information Unavailable</h3>
                    <p class="table-empty-desc">${escapeXml(errorMsg)}</p>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="selectRestockCandidate(${productId})">
                        🔄 Retry Query
                    </button>
                </div>
            `;
        }
        return;
    }

    const responseNode = getXmlNode(result.xmlDoc, "CheckSupplierAvailabilityResponse");
    const supplierName = getXmlValue(responseNode, "supplierName") || "Supplier";
    const availableQty = parseInt(getXmlValue(responseNode, "availableQuantity") || "0", 10);
    const supplierPrice = parseFloat(getXmlValue(responseNode, "supplierPrice") || "0.0");
    const available = getXmlValue(responseNode, "available").toLowerCase() === "true";

    // Fulfillability check
    const canFulfill = available && availableQty >= suggested;
    const partialFulfill = available && availableQty > 0 && availableQty < suggested;

    let fulfillBadge = "";
    if (canFulfill) {
        fulfillBadge = `<span class="fulfill-badge fulfill-full">✔ Supplier Available (${availableQty} units available)</span>`;
    } else if (partialFulfill) {
        fulfillBadge = `<span class="fulfill-badge fulfill-partial">⚠️ Partial Supplier Stock (${availableQty} available / ${suggested - availableQty} short)</span>`;
    } else {
        fulfillBadge = `<span class="fulfill-badge fulfill-none">✖ Supplier Information Unavailable</span>`;
    }

    const totalCost = (suggested * supplierPrice);
    const unitSavings = product.price > supplierPrice ? (product.price - supplierPrice) : 0;
    const defaultReceiptQty = availableQty > 0 ? Math.min(suggested, availableQty) : suggested;
    const defaultReceiptRef = `RESTOCK-REC-${productId}-${Math.floor(1000 + Math.random() * 9000)}`;

    let cardHtml = `
        <div class="analysis-card-header">
            <div>
                <div class="analysis-prod-title">#${product.id} ${escapeXml(product.name)}</div>
                <div class="analysis-prod-meta">
                    Category: <strong>${escapeXml(product.category)}</strong> • Current Stock: <strong>${product.quantity}</strong> • Target: <strong>${RESTOCK_TARGET_STOCK}</strong> • Suggested Replenishment: <strong class="text-primary">+${suggested} units</strong>
                </div>
            </div>
        </div>

        <!-- Supplier Availability & Quote -->
        <div class="supplier-quote-box">
            <div class="supplier-quote-header">
                <span class="supplier-quote-title">🏢 ${escapeXml(supplierName)}</span>
                ${fulfillBadge}
            </div>

            <div class="quote-row">
                <span>Supplier Availability:</span>
                <strong>${available ? `${availableQty} units available` : 'Supplier Information Unavailable'}</strong>
            </div>
            <div class="quote-row">
                <span>Wholesale Unit Price:</span>
                <strong style="color: var(--primary);">${available && supplierPrice > 0 ? '₹' + supplierPrice.toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '<span style="color: var(--text-muted);">Estimated Cost Unavailable</span>'}</strong>
            </div>
            <div class="quote-row">
                <span>Catalog Retail Price (INR):</span>
                <span>₹${product.price.toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
            ${unitSavings > 0 ? `
            <div class="quote-row" style="color: var(--success);">
                <span>Estimated Margin / Savings:</span>
                <strong>₹${unitSavings.toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${((unitSavings / product.price) * 100).toFixed(1)}%)</strong>
            </div>
            ` : ''}
            <div class="quote-row quote-row-total">
                <span>Estimated Total Procurement Cost (+${suggested} units):</span>
                <span>${available && supplierPrice > 0 ? '₹' + totalCost.toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '<span style="color: var(--text-muted);">Estimated Cost Unavailable</span>'}</span>
            </div>
        </div>

        <!-- Currency Conversion Section (Base Currency: INR) -->
        <div class="currency-conversion-box">
            <div class="currency-conversion-header">
                <span>💱 Currency Conversion (Base: INR)</span>
            </div>
            <p style="margin-bottom: 8px; color: var(--text-secondary);">
                Wholesale quotes and catalog prices are established in Indian Rupees (INR). You can convert this procurement cost to international currencies:
            </p>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="convertRestockCurrency(${totalCost}, 'INR', 'USD')">
                    Convert to USD ($)
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="convertRestockCurrency(${totalCost}, 'INR', 'EUR')">
                    Convert to EUR (€)
                </button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="convertRestockCurrency(${totalCost}, 'INR', 'INR')">
                    Verify Base (INR)
                </button>
                <div id="restockCurrencyResult" style="margin-left: 8px; font-weight: 600; color: var(--text-primary);"></div>
            </div>
        </div>

        <!-- Record Received Stock -->
        <div class="simulated-receipt-box">
            <div class="simulated-receipt-title">
                <span>📥 Record Received Stock</span>
            </div>
            <p style="font-size: 13px; color: #065f46; margin-bottom: 10px;">
                Record the arrival of replenishment units into warehouse inventory. This updates the catalog balance and logs an audited movement record.
            </p>

            <div class="receipt-input-grid">
                <div class="receipt-input-group">
                    <label for="receiptQtyInput">Quantity Received (units):</label>
                    <input type="number" id="receiptQtyInput" value="${defaultReceiptQty}" min="1" step="1">
                </div>
                <div class="receipt-input-group">
                    <label for="receiptRefInput">Receipt / PO Reference:</label>
                    <input type="text" id="receiptRefInput" value="${escapeXml(defaultReceiptRef)}">
                </div>
                <div class="receipt-input-group" style="grid-column: 1 / -1;">
                    <label for="receiptReasonInput">Audit Reason / Note:</label>
                    <input type="text" id="receiptReasonInput" value="Restock receipt from ${escapeXml(supplierName)}">
                </div>
            </div>

            <button type="button" class="btn btn-primary btn-sm" id="btnConfirmReceipt" onclick="confirmSimulatedReceipt(${productId}, '${escapeXml(supplierName)}')">
                <span>📥 Record Received Stock</span>
            </button>
        </div>
    `;

    if (card) {
        card.innerHTML = cardHtml;
    }
}

async function convertRestockCurrency(amount, baseCurrency, targetCurrency) {
    const resultEl = document.getElementById("restockCurrencyResult");
    if (!resultEl) return;

    if (!amount || amount <= 0) {
        resultEl.innerHTML = `<span style="color:var(--text-muted);">Estimated Cost Unavailable</span>`;
        return;
    }

    if (baseCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
        resultEl.innerHTML = `₹${amount.toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})} INR (Rate: 1.0)`;
        return;
    }

    resultEl.innerHTML = `<span class="supplier-spinner">🔄</span> Fetching live rate...`;

    try {
        const res = await fetch(`https://api.frankfurter.dev/v1/latest?from=${baseCurrency}&to=${targetCurrency}`);
        if (!res.ok) throw new Error("Exchange rate service unavailable");
        const data = await res.json();
        if (data && data.rates && data.rates[targetCurrency]) {
            const rate = data.rates[targetCurrency];
            const converted = (amount * rate).toFixed(2);
            const symbol = targetCurrency === "USD" ? "$" : (targetCurrency === "EUR" ? "€" : "");
            resultEl.innerHTML = `<strong>${symbol}${Number(converted).toLocaleString()} ${targetCurrency}</strong> (Rate: ${rate.toFixed(4)})`;
        } else {
            resultEl.innerHTML = `<span style="color:var(--danger);">Estimated Cost Unavailable</span>`;
        }
    } catch (err) {
        resultEl.innerHTML = `<span style="color:var(--text-muted); font-size:12px;">Currency conversion unavailable</span>`;
    }
}

async function confirmSimulatedReceipt(productId, supplierName) {
    const qtyInput = document.getElementById("receiptQtyInput");
    const refInput = document.getElementById("receiptRefInput");
    const reasonInput = document.getElementById("receiptReasonInput");
    const confirmBtn = document.getElementById("btnConfirmReceipt");

    const qtyVal = qtyInput ? parseInt(qtyInput.value.trim(), 10) : 0;
    const refVal = refInput ? refInput.value.trim() : `RESTOCK-REC-${productId}`;
    const reasonVal = reasonInput ? reasonInput.value.trim() : `Restock receipt from ${supplierName}`;

    if (isNaN(qtyVal) || qtyVal <= 0) {
        showResult("Please enter a valid positive quantity to receive.", "error", "Validation Error");
        return;
    }

    // Disable button to prevent double submission
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<span>🔄 Recording Stock Receipt...</span>`;
    }

    showResult(`Recording restock receipt for #${productId} (+${qtyVal} units)...`, "info", "Stock Receipt");

    const soapPayload = `<inv:AdjustStockRequest>
        <inv:productId>${productId}</inv:productId>
        <inv:quantityChange>${qtyVal}</inv:quantityChange>
        <inv:reason>${escapeXml(reasonVal)}</inv:reason>
        <inv:reference>${escapeXml(refVal)}</inv:reference>
    </inv:AdjustStockRequest>`;

    const result = await callSoapService("adjustStock", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "Failed to record stock receipt.";
        showResult(errorMsg, "error", "Stock Receipt");
        renderSoapResponseCard("adjustStock", "FAULT", errorMsg, null, result.rawXml);
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `<span>📥 Record Received Stock</span>`;
        }
        return;
    }

    const responseNode = getXmlNode(result.xmlDoc, "AdjustStockResponse");
    const successStr = getXmlValue(responseNode, "success");
    const isSuccess = successStr.toLowerCase() === "true";
    const message = getXmlValue(responseNode, "message") || (isSuccess ? "Stock receipt recorded successfully" : "Failed to record stock receipt");
    const updatedQuantityStr = getXmlValue(responseNode, "updatedQuantity");
    const updatedQuantity = updatedQuantityStr ? parseInt(updatedQuantityStr, 10) : null;

    if (isSuccess) {
        showResult(`Restock receipt recorded: +${qtyVal} units added to Product #${productId} (new balance: ${updatedQuantity} units).`, "success", "Stock Received");
        renderSoapResponseCard("adjustStock", "SUCCESS", message, {
            id: productId,
            quantity: updatedQuantity !== null ? updatedQuantity : "Updated"
        }, result.rawXml);

        if (updatedQuantity !== null && productCache.has(productId)) {
            const prod = productCache.get(productId);
            prod.quantity = updatedQuantity;
            productCache.set(productId, prod);
            renderInventoryTable();
            renderSmartRestocking();
            updateStatistics(`Restock Receipt #${productId} (+${qtyVal})`);
        }

        // 1. Refresh inventory via getAllProducts
        await fetchAllProducts(false, `Restock Receipt #${productId} (+${qtyVal})`);

        // 2. Refresh stock movement history via getStockMovements
        await fetchStockMovements(false);

        // 3. Re-evaluate Smart Restocking
        renderSmartRestocking();

        // 4. Update details if selected
        const updatedProd = productCache.get(productId);
        if (updatedProd) {
            displayProduct(updatedProd);
        }
    } else {
        showResult(message, "error", "Stock Receipt");
        renderSoapResponseCard("adjustStock", "FAILED", message, { id: productId }, result.rawXml);
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `<span>📥 Record Received Stock</span>`;
        }
    }
}

function scrollToSmartRestocking() {
    navigateTo("restocking");
}

// ==========================================================================
// Milestone 4: Weather-Aware Inventory Operations & Risk Advisories
// ==========================================================================

let currentWeatherReport = null;

async function fetchWeatherAdvisories(forceRefresh = false) {
    const container = document.getElementById("weatherAdvisoriesContainer");
    const refreshBtn = document.getElementById("btnRefreshWeather");
    const refreshText = document.getElementById("weatherRefreshBtnText");
    const horizonSelect = document.getElementById("weatherHorizonSelect");

    const horizon = horizonSelect ? parseInt(horizonSelect.value, 10) : 48;

    if (refreshBtn) refreshBtn.disabled = true;
    if (refreshText) refreshText.textContent = "🔄 Refreshing...";

    if (!currentWeatherReport && container) {
        container.innerHTML = `
            <div class="table-loading">
                <span class="supplier-spinner">🔄</span>
                <span>Loading operational weather forecast...</span>
            </div>
        `;
    }

    const soapPayload = `<inv:GetWeatherAdvisoriesRequest>
        <inv:maxHorizonHours>${horizon}</inv:maxHorizonHours>
    </inv:GetWeatherAdvisoriesRequest>`;

    try {
        const result = await callSoapService("getWeatherAdvisories", soapPayload);

        if (!result.ok || !result.xmlDoc) {
            const errorMsg = result.fault || "Unable to retrieve weather advisories.";
            renderWeatherError(errorMsg);
            return;
        }

        const respNode = getXmlNode(result.xmlDoc, "GetWeatherAdvisoriesResponse");
        if (!respNode) {
            renderWeatherError("Weather response was invalid or empty.");
            return;
        }

        const location = getXmlValue(respNode, "location") || "Warehouse Hub";
        const latStr = getXmlValue(respNode, "latitude");
        const lonStr = getXmlValue(respNode, "longitude");
        const latitude = latStr ? parseFloat(latStr) : 19.0760;
        const longitude = lonStr ? parseFloat(lonStr) : 72.8777;
        const retrievalTime = getXmlValue(respNode, "retrievalTime") || "Just now";
        const forecastHorizonHours = parseInt(getXmlValue(respNode, "forecastHorizonHours") || "48", 10);
        const status = getXmlValue(respNode, "status") || "OK";

        const currentWeathNode = getXmlNode(respNode, "currentWeather");
        let currentWeather = {
            temperature: 0.0,
            windSpeed: 0.0,
            condition: "Normal",
            status: "OK"
        };
        if (currentWeathNode) {
            const tempVal = getXmlValue(currentWeathNode, "temperature");
            const windVal = getXmlValue(currentWeathNode, "windSpeed");
            currentWeather.temperature = tempVal ? parseFloat(tempVal) : 0.0;
            currentWeather.windSpeed = windVal ? parseFloat(windVal) : 0.0;
            currentWeather.condition = getXmlValue(currentWeathNode, "weatherCondition") || "Fair";
            currentWeather.status = getXmlValue(currentWeathNode, "status") || "OK";
        }

        // Parse advisories
        const advisoryNodes = respNode.getElementsByTagName("advisories");
        const advisories = [];
        for (let i = 0; i < advisoryNodes.length; i++) {
            const advNode = advisoryNodes[i];
            advisories.push({
                id: getXmlValue(advNode, "id"),
                severity: getXmlValue(advNode, "severity") || "INFO",
                title: getXmlValue(advNode, "title") || "Weather Advisory",
                description: getXmlValue(advNode, "description") || "",
                expectedTime: getXmlValue(advNode, "expectedTime") || "",
                triggerConditions: getXmlValue(advNode, "triggerConditions") || "",
                recommendedAction: getXmlValue(advNode, "recommendedAction") || "",
                disclaimer: getXmlValue(advNode, "disclaimer") || "Forecast-based operational advisory; not confirmation of road closures or transport disruptions."
            });
        }

        const hasAdverseWeather = advisories.some(a => a.severity === "HIGH" || a.severity === "WARNING");

        currentWeatherReport = {
            location,
            latitude,
            longitude,
            retrievalTime,
            forecastHorizonHours,
            status,
            currentWeather,
            advisories,
            hasAdverseWeather
        };

        renderWeatherRiskSection(currentWeatherReport);
        renderSmartRestocking();

    } catch (err) {
        console.error("Error fetching weather advisories:", err);
        renderWeatherError(err.message);
    } finally {
        if (refreshBtn) refreshBtn.disabled = false;
        if (refreshText) refreshText.textContent = "🔄 Refresh Forecast";
    }
}

function renderWeatherRiskSection(report) {
    if (!report) return;

    // 1. Warehouse Details
    const hubName = document.getElementById("weatherHubName");
    const hubCoords = document.getElementById("weatherHubCoords");
    const hubRetrieval = document.getElementById("weatherRetrievalTime");
    if (hubName) hubName.textContent = report.location;
    if (hubCoords) hubCoords.textContent = "Primary Logistics Hub • Mumbai";
    if (hubRetrieval) hubRetrieval.textContent = `Last Updated: ${report.retrievalTime}`;

    // 2. Current Conditions
    const currentTemp = document.getElementById("weatherCurrentTemp");
    const currentCond = document.getElementById("weatherCurrentCondition");
    const currentWind = document.getElementById("weatherCurrentWind");
    const currentIcon = document.getElementById("weatherCurrentIcon");

    if (currentTemp) currentTemp.textContent = `${report.currentWeather.temperature.toFixed(1)} °C`;
    if (currentCond) currentCond.textContent = report.currentWeather.condition;
    if (currentWind) currentWind.textContent = `Wind: ${report.currentWeather.windSpeed.toFixed(1)} km/h`;

    if (currentIcon) {
        const cond = report.currentWeather.condition.toLowerCase();
        if (cond.includes("thunder") || cond.includes("storm")) {
            currentIcon.textContent = "⛈️";
        } else if (cond.includes("rain") || cond.includes("drizzle") || cond.includes("shower")) {
            currentIcon.textContent = "🌧️";
        } else if (cond.includes("snow")) {
            currentIcon.textContent = "🌨️";
        } else if (cond.includes("cloud") || cond.includes("overcast")) {
            currentIcon.textContent = "⛅";
        } else if (cond.includes("fog")) {
            currentIcon.textContent = "🌫️";
        } else {
            currentIcon.textContent = "☀️";
        }
    }

    // 3. Advisory Status & Overall Risk Level
    const riskLevel = document.getElementById("weatherAdvisoryRiskLevel");
    const riskSummary = document.getElementById("weatherAdvisoryRiskSummary");
    const riskIcon = document.getElementById("weatherRiskLevelIcon");
    const cacheIndicator = document.getElementById("weatherCacheIndicator");

    const highCount = report.advisories.filter(a => a.severity === "HIGH").length;
    const warnCount = report.advisories.filter(a => a.severity === "WARNING").length;

    if (riskLevel && riskSummary && riskIcon) {
        riskLevel.className = "weather-risk-level";
        if (highCount > 0) {
            riskLevel.textContent = "HIGH RISK ALERT";
            riskLevel.classList.add("level-high");
            riskSummary.textContent = `${highCount} weather alert(s) detected across ${report.forecastHorizonHours}h forecast window. Replenishment may be affected.`;
            riskIcon.textContent = "🚨";
        } else if (warnCount > 0) {
            riskLevel.textContent = "MODERATE CAUTION";
            riskLevel.classList.add("level-warning");
            riskSummary.textContent = `${warnCount} weather advisory(ies) active across ${report.forecastHorizonHours}h forecast window.`;
            riskIcon.textContent = "⚠️";
        } else {
            riskLevel.textContent = "NORMAL OPERATIONS";
            riskLevel.classList.add("level-safe");
            riskSummary.textContent = `No adverse weather conditions detected in next ${report.forecastHorizonHours} hours. Standard operations apply.`;
            riskIcon.textContent = "🛡️";
        }
    }

    if (cacheIndicator) {
        const isOffline = report.status.toLowerCase().includes("unavailable");
        cacheIndicator.textContent = isOffline ? "Status: Degraded" : "Status: Operational";
        cacheIndicator.style.color = isOffline ? "var(--danger)" : "var(--text-muted)";
    }

    // 4. Render Advisories List
    const container = document.getElementById("weatherAdvisoriesContainer");
    if (!container) return;

    if (report.advisories.length === 0) {
        container.innerHTML = `
            <div class="advisory-card advisory-card-info">
                <div class="advisory-header-row">
                    <div class="advisory-title-group">
                        <span class="advisory-severity-badge advisory-badge-info">ℹ️ INFORMATIONAL</span>
                        <h3 class="advisory-title">No Active Weather Advisories</h3>
                    </div>
                    <span class="advisory-time-pill">Forecast Window: Next ${report.forecastHorizonHours} Hours</span>
                </div>
                <p class="advisory-desc">Forecast reports standard conditions. No operational disruptions expected.</p>
                <div class="advisory-action-box">
                    <div class="advisory-action-header">✔ Recommended Action</div>
                    <div class="advisory-action-text">Standard warehousing, inventory replenishment, and dock receiving operations remain in effect.</div>
                </div>
                <div class="advisory-disclaimer-note">Forecast-based operational advisory; not confirmation of road closures or transport disruptions.</div>
            </div>
        `;
        return;
    }

    let cardsHtml = "";
    report.advisories.forEach(adv => {
        let cardClass = "advisory-card-info";
        let badgeClass = "advisory-badge-info";
        let badgeIcon = "ℹ️";

        if (adv.severity === "HIGH") {
            cardClass = "advisory-card-high";
            badgeClass = "advisory-badge-high";
            badgeIcon = "🚨";
        } else if (adv.severity === "WARNING") {
            cardClass = "advisory-card-warning";
            badgeClass = "advisory-badge-warning";
            badgeIcon = "⚠️";
        }

        cardsHtml += `
            <div class="advisory-card ${cardClass}" id="advisory-${escapeXml(adv.id)}">
                <div class="advisory-header-row">
                    <div class="advisory-title-group">
                        <span class="advisory-severity-badge ${badgeClass}">${badgeIcon} ${escapeXml(adv.severity)}</span>
                        <h3 class="advisory-title">${escapeXml(adv.title)}</h3>
                    </div>
                    <span class="advisory-time-pill">⏰ Window: ${escapeXml(adv.expectedTime)}</span>
                </div>

                <p class="advisory-desc">${escapeXml(adv.description)}</p>

                ${adv.triggerConditions ? `
                <div class="advisory-metrics-box">
                    <span class="advisory-metrics-label">Observed Condition:</span>
                    <span class="advisory-metrics-val">${escapeXml(adv.triggerConditions)}</span>
                </div>
                ` : ''}

                <div class="advisory-action-box">
                    <div class="advisory-action-header">📋 Recommended Action</div>
                    <div class="advisory-action-text">${escapeXml(adv.recommendedAction)}</div>
                </div>

                <div class="advisory-disclaimer-note">
                    ℹ️ ${escapeXml(adv.disclaimer)}
                </div>
            </div>
        `;
    });

    container.innerHTML = cardsHtml;
}

function renderWeatherError(errorMessage) {
    const container = document.getElementById("weatherAdvisoriesContainer");
    if (!container) return;

    container.innerHTML = `
        <div class="weather-error-state">
            <div class="weather-state-icon">⚠️</div>
            <h3>Weather Information Temporarily Unavailable</h3>
            <p>Weather information is temporarily unavailable. Standard warehouse operations remain unaffected.</p>
            <button type="button" class="btn btn-secondary btn-sm" onclick="fetchWeatherAdvisories(true)">
                🔄 Retry Weather Update
            </button>
        </div>
    `;

    const riskLevel = document.getElementById("weatherAdvisoryRiskLevel");
    const riskSummary = document.getElementById("weatherAdvisoryRiskSummary");
    const cacheIndicator = document.getElementById("weatherCacheIndicator");
    if (riskLevel) {
        riskLevel.textContent = "SERVICE UNAVAILABLE";
        riskLevel.className = "weather-risk-level level-warning";
    }
    if (riskSummary) riskSummary.textContent = "Weather information is temporarily unavailable. Existing inventory workflows remain operational.";
    if (cacheIndicator) {
        cacheIndicator.textContent = "Status: Offline";
        cacheIndicator.style.color = "var(--danger)";
    }
}

function onWeatherHorizonChange() {
    fetchWeatherAdvisories(false);
}

function scrollToWeatherRisk() {
    navigateTo("operations");
}