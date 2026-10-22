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
                "SOAPAction": `"${SOAP_NAMESPACE}/${operationName}"`
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
// Tab Navigation
// --------------------------------------------------------------------------
function switchTab(tabId) {
    const validTabs = ["add", "get", "update", "delete", "adjust", "external"];
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

    showResult("Dispatching SOAP AddProductRequest to /ws...", "info", "SOAP Request");

    const result = await callSoapService("addProduct", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "SOAP service communication failure.";
        showResult(errorMsg, "error", "SOAP Fault / Error");
        renderSoapResponseCard("addProduct", "FAULT", errorMsg, product, result.rawXml);
        return;
    }

    // Parse AddProductResponse
    const responseNode = getXmlNode(result.xmlDoc, "AddProductResponse");
    const successStr = getXmlValue(responseNode, "success");
    const isSuccess = successStr.toLowerCase() === "true";
    const message = getXmlValue(responseNode, "message") || (isSuccess ? "Product added successfully via SOAP" : "Failed to add product");

    if (isSuccess) {
        displayProduct(product);
        clearAddForm();
        showResult(message, "success", "SOAP: addProduct");
        renderSoapResponseCard("addProduct", "SUCCESS", message, product, result.rawXml);
        await fetchAllProducts(false, "SOAP Added #" + product.id);
        await fetchStockMovements(false);
    } else {
        showResult(message, "error", "SOAP: addProduct");
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

    showResult(`Dispatching SOAP GetProductRequest for ID #${id} to /ws...`, "info", "SOAP Request");

    const result = await callSoapService("getProduct", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "SOAP service communication failure.";
        showResult(errorMsg, "error", "SOAP Fault / Error");
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
        updateStatistics("SOAP Retrieved #" + id);
        displayProduct(product);
        prefillUpdateForm(product);
        showResult(message || "Product retrieved successfully via SOAP", "success", "SOAP: getProduct");
        renderSoapResponseCard("getProduct", "SUCCESS", message || "Product found successfully", product, result.rawXml);
    } else {
        clearProductDetails();
        const notFoundMsg = message || `Product with ID ${id} not found in database.`;
        showResult(notFoundMsg, "error", "SOAP: getProduct");
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

    showResult(`Dispatching SOAP UpdateProductRequest for ID #${product.id} to /ws...`, "info", "SOAP Request");

    const result = await callSoapService("updateProduct", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "SOAP service communication failure.";
        showResult(errorMsg, "error", "SOAP Fault / Error");
        renderSoapResponseCard("updateProduct", "FAULT", errorMsg, product, result.rawXml);
        return;
    }

    // Parse UpdateProductResponse
    const responseNode = getXmlNode(result.xmlDoc, "UpdateProductResponse");
    const successStr = getXmlValue(responseNode, "success");
    const isSuccess = successStr.toLowerCase() === "true";
    const message = getXmlValue(responseNode, "message") || (isSuccess ? "Product updated successfully via SOAP" : "Failed to update product");

    if (isSuccess) {
        displayProduct(product);
        clearUpdateForm();
        showResult(message, "success", "SOAP: updateProduct");
        renderSoapResponseCard("updateProduct", "SUCCESS", message, product, result.rawXml);
        await fetchAllProducts(false, "SOAP Updated #" + product.id);
        await fetchStockMovements(false);
    } else {
        showResult(message, "error", "SOAP: updateProduct");
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

    showResult(`Dispatching SOAP DeleteProductRequest for ID #${id} to /ws...`, "info", "SOAP Request");

    const result = await callSoapService("deleteProduct", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "SOAP service communication failure.";
        showResult(errorMsg, "error", "SOAP Fault / Error");
        renderSoapResponseCard("deleteProduct", "FAULT", errorMsg, { id: id }, result.rawXml);
        return;
    }

    // Parse DeleteProductResponse
    const responseNode = getXmlNode(result.xmlDoc, "DeleteProductResponse");
    const successStr = getXmlValue(responseNode, "success");
    const isSuccess = successStr.toLowerCase() === "true";
    const message = getXmlValue(responseNode, "message") || (isSuccess ? "Product deleted successfully via SOAP" : "Failed to delete product");

    if (isSuccess) {
        showResult(message, "success", "SOAP: deleteProduct");
        renderSoapResponseCard("deleteProduct", "SUCCESS", message, { id: id }, result.rawXml);
        document.getElementById("deleteId").value = "";

        const badge = document.getElementById("detailsStatusBadge");
        if (badge) {
            badge.textContent = "Deleted";
            badge.style.backgroundColor = "#fef2f2";
            badge.style.color = "#dc2626";
        }
        await fetchAllProducts(false, "SOAP Deleted #" + id);
        await fetchStockMovements(false);
    } else {
        showResult(message, "error", "SOAP: deleteProduct");
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
            <span>Querying independent Supplier Service via SOAP CheckSupplierAvailabilityRequest (/ws)...</span>
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
                ⚠️ Could not communicate with Supplier Service via SOAP. Verify backend connection.
            </div>
        `;
        showResult("Failed to reach Supplier Service via SOAP", "error", "Network Error");
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
    badge.textContent = available ? "✔ Supplier Stock Available" : "✖ Not Available";

    const title = document.createElement("h4");
    title.className = "supplier-card-title";
    title.textContent = supplierName;

    titleGroup.appendChild(badge);
    titleGroup.appendChild(title);

    const portBadge = document.createElement("span");
    portBadge.className = "supplier-service-tag";
    portBadge.textContent = "SOAP ➔ AWS ECS Supplier";

    header.appendChild(titleGroup);
    header.appendChild(portBadge);

    const grid = document.createElement("div");
    grid.className = "supplier-grid";

    grid.appendChild(createSupplierStat("Product ID", "#" + productId));
    grid.appendChild(createSupplierStat("Available Quantity", availableQuantity + " units"));
    grid.appendChild(createSupplierStat("Supplier Price", "₹" + supplierPrice.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
    grid.appendChild(createSupplierStat("Availability", available ? "AVAILABLE" : "UNAVAILABLE"));

    card.appendChild(header);
    card.appendChild(grid);

    container.appendChild(card);
    showResult(`SOAP checkSupplierAvailability received for #${productId}: ${available ? "AVAILABLE" : "UNAVAILABLE"}`, available ? "success" : "info", "SOAP Response");
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
            <span>Dispatching SOAP GetProductExternalInfoRequest to /ws across 4 distributed sources...</span>
        </div>
    `;

    // Construct SOAP 1.1 GetProductExternalInfoRequest payload
    const soapPayload = `
        <inv:GetProductExternalInfoRequest>
            <inv:id>${productId}</inv:id>
        </inv:GetProductExternalInfoRequest>`;

    const result = await callSoapService("getProductExternalInfo", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "SOAP service communication failure.";
        container.innerHTML = `
            <div class="external-error-box">
                <span class="err-icon">⚠️</span>
                <div>
                    <strong>SOAP Error:</strong> ${escapeXml(errorMsg)}
                </div>
            </div>
        `;
        showResult(errorMsg, "error", "SOAP Fault");
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
                    <strong>SOAP Query Result:</strong> ${escapeXml(message || "Product not found")}
                </div>
            </div>
        `;
        showResult(message || "Product not found", "error", "External Query");
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
    const wtrLoc = getXmlValue(wtrNode, "location") || "Mumbai Central Distribution Hub";
    const wtrTemp = getXmlValue(wtrNode, "temperature") || "0.0";
    const wtrWind = getXmlValue(wtrNode, "windSpeed") || "0.0";
    const wtrCond = getXmlValue(wtrNode, "weatherCondition") || "N/A";
    const wtrStatus = getXmlValue(wtrNode, "status") || "OK";

    // Build the exact structured display required by the project specifications
    container.innerHTML = "";

    const extWrapper = document.createElement("div");
    extWrapper.className = "external-intel-wrapper";

    extWrapper.innerHTML = `
        <!-- HEADER TITLE -->
        <div class="ext-intel-header">
            <div class="ext-intel-title-row">
                <span class="ext-pulse-dot"></span>
                <span class="ext-main-title">EXTERNAL PRODUCT INFORMATION</span>
                <span class="ext-proto-tag">SOAP: getProductExternalInfo</span>
            </div>
            <p class="ext-intel-desc">Single SOAP operation coordinating 4 distributed cloud services via AWS ECS Fargate</p>
        </div>

        <!-- SERVICE INTEGRATION TRANSPARENCY BAR -->
        <div class="service-integration-card">
            <div class="svc-int-title">SERVICE INTEGRATION</div>
            <div class="svc-int-grid">
                <div class="svc-int-item">
                    <span class="svc-check">✓</span>
                    <div class="svc-item-info">
                        <strong>Inventory Database</strong>
                        <span>Amazon RDS PostgreSQL</span>
                    </div>
                </div>
                <div class="svc-int-item">
                    <span class="svc-check">✓</span>
                    <div class="svc-item-info">
                        <strong>Supplier Service</strong>
                        <span>AWS ECS / REST</span>
                    </div>
                </div>
                <div class="svc-int-item">
                    <span class="svc-check">✓</span>
                    <div class="svc-item-info">
                        <strong>Currency Service</strong>
                        <span>Frankfurter API / REST</span>
                    </div>
                </div>
                <div class="svc-int-item">
                    <span class="svc-check">✓</span>
                    <div class="svc-item-info">
                        <strong>Weather Service</strong>
                        <span>Open-Meteo API / REST</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 4 INDEPENDENT SERVICE CARDS -->
        <div class="external-quad-grid">

            <!-- 1. PRODUCT DATA — AWS RDS -->
            <div class="external-card card-database">
                <div class="ext-card-header">
                    <span class="ext-icon">🗄️</span>
                    <div>
                        <h4 class="ext-title">PRODUCT DATA — AWS RDS</h4>
                        <span class="ext-source">Amazon RDS PostgreSQL</span>
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

            <!-- 2. SUPPLIER SERVICE — AWS ECS -->
            <div class="external-card ${supAvailable ? 'card-supplier-avail' : 'card-supplier-unavail'}">
                <div class="ext-card-header">
                    <span class="ext-icon">🏢</span>
                    <div>
                        <h4 class="ext-title">SUPPLIER SERVICE — AWS ECS</h4>
                        <span class="ext-source">Distributed Microservice</span>
                    </div>
                </div>
                <div class="ext-card-body">
                    <div class="ext-stat-row"><span>Supplier:</span> <strong>${escapeXml(supName)}</strong></div>
                    <div class="ext-stat-row"><span>Available Quantity:</span> <strong>${escapeXml(supQuantity)} units</strong></div>
                    <div class="ext-stat-row"><span>Supplier Price:</span> <strong>₹${supPrice.toLocaleString("en-IN", {minimumFractionDigits: 2})}</strong></div>
                    <div class="ext-stat-row"><span>Availability:</span> <span class="ext-badge ${supAvailable ? 'badge-success-ext' : 'badge-danger-ext'}">${supAvailable ? 'AVAILABLE' : 'UNAVAILABLE'}</span></div>
                    <div class="ext-stat-status">${escapeXml(supStatus)}</div>
                </div>
            </div>

            <!-- 3. CURRENCY SERVICE — FRANKFURTER -->
            <div class="external-card card-currency">
                <div class="ext-card-header">
                    <span class="ext-icon">💱</span>
                    <div>
                        <h4 class="ext-title">CURRENCY SERVICE — FRANKFURTER</h4>
                        <span class="ext-source">Frankfurter Public API</span>
                    </div>
                </div>
                <div class="ext-card-body">
                    <div class="ext-stat-row"><span>Exchange Pair:</span> <strong>${escapeXml(baseCur)} → ${escapeXml(targetCur)}</strong></div>
                    <div class="ext-stat-row"><span>Exchange Rate:</span> <strong>${escapeXml(exRate)}</strong></div>
                    <div class="ext-stat-row"><span>Converted Price:</span> <strong>${parseFloat(exRate) > 0 ? '$' + convertedPrice.toLocaleString("en-US", {minimumFractionDigits: 2}) + ' ' + escapeXml(targetCur) : '<span style="color: var(--text-muted);">Rate Unavailable</span>'}</strong></div>
                    <div class="ext-stat-row"><span>Formula:</span> <code>${parseFloat(exRate) > 0 ? '₹' + prodPrice + ' × ' + exRate : '<span style="color: var(--text-muted);">Conversion Offline</span>'}</code></div>
                    <div class="ext-stat-status">${escapeXml(curStatus)}</div>
                </div>
            </div>

            <!-- 4. WEATHER SERVICE — OPEN-METEO -->
            <div class="external-card card-weather">
                <div class="ext-card-header">
                    <span class="ext-icon">🌤️</span>
                    <div>
                        <h4 class="ext-title">WEATHER SERVICE — OPEN-METEO</h4>
                        <span class="ext-source">Open-Meteo Public API</span>
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

        <!-- COLLAPSIBLE RAW SOAP XML ACCORDION -->
        <div class="soap-raw-accordion" style="margin-top: 16px;">
            <details>
                <summary class="soap-raw-summary">
                    <span>📄 Inspect Raw GetProductExternalInfoResponse SOAP XML</span>
                    <span class="soap-raw-tag">SOAP 1.1 Envelope</span>
                </summary>
                <div class="soap-raw-content">
                    <pre><code>${escapeXml(formatXmlForDisplay(result.rawXml))}</code></pre>
                </div>
            </details>
        </div>
    `;

    container.appendChild(extWrapper);

    showResult("SOAP getProductExternalInfo coordinated 4 distributed services successfully!", "success", "SOAP Coordination");

    // Also update SOAP response card
    renderSoapResponseCard(
        "getProductExternalInfo",
        "SUCCESS",
        "Coordinated AWS RDS + AWS ECS Supplier + Frankfurter + Open-Meteo",
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
    supplierBtn.textContent = "🏢 SOAP: Check Supplier";
    supplierBtn.onclick = () => {
        checkSupplierAvailability(product.id);
    };

    const externalBtn = document.createElement("button");
    externalBtn.type = "button";
    externalBtn.className = "btn btn-primary btn-sm";
    externalBtn.textContent = "🌐 SOAP: External Info";
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
    desc.textContent = "Retrieve a product using \"Get Product\" or add a new one via SOAP to inspect its details here.";

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
// Status Notification
// --------------------------------------------------------------------------
function showResult(message, type = "info", title = "") {
    const resultEl = document.getElementById("result");
    if (!resultEl) return;

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
        defaultTitle = "SOAP Notification";
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
                <span>Synchronizing live inventory from backend via SOAP getAllProducts (/ws)...</span>
            </div>
        `;
    }

    const soapPayload = `<inv:GetAllProductsRequest/>`;

    const result = await callSoapService("getAllProducts", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "SOAP service communication failure while loading inventory.";
        if (tableContainer) {
            tableContainer.innerHTML = `
                <div class="table-empty-state">
                    <div class="table-empty-icon">⚠️</div>
                    <h3 class="table-empty-title">Failed to Load Inventory via SOAP</h3>
                    <p class="table-empty-desc">${escapeXml(errorMsg)}</p>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="fetchAllProducts(true)">
                        🔄 Retry Connection
                    </button>
                </div>
            `;
        }
        showResult(errorMsg, "error", "SOAP: getAllProducts");
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
    const lastOpLabel = operationContext || (isManualRefresh ? "SOAP: Refresh (" + productCache.size + ")" : "Live DB Synced");
    updateStatistics(lastOpLabel);

    // Render table and smart restocking
    renderInventoryTable();
    renderSmartRestocking();

    if (isManualRefresh) {
        showResult(`Successfully synchronized ${productCache.size} products from database via SOAP.`, "success", "SOAP: getAllProducts");
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
                    <h3 class="table-empty-title">No Products in Database</h3>
                    <p class="table-empty-desc">Your database currently has 0 inventory items. Use the "Add Product" operation to insert your first product via SOAP.</p>
                    <button type="button" class="btn btn-primary btn-sm" onclick="switchTab('add')">
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
                        🔍 Inspect
                    </button>
                    <button type="button" class="table-action-btn" title="Load into Update Form" onclick="loadProductToUpdate(${p.id})">
                        ✏️ Edit
                    </button>
                    <button type="button" class="table-action-btn" title="Adjust Stock" onclick="loadProductToAdjust(${p.id})">
                        ⚖️ Adjust
                    </button>
                    ${(isOutOfStock || isLowStock) ? `
                    <button type="button" class="table-action-btn" title="Smart Restocking" onclick="selectRestockCandidate(${p.id})">
                        💡 Restock
                    </button>` : ''}
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
        showResult(`Inspecting Product #${product.id} (${product.name})`, "info", "Product Selected");
        const detailsEl = document.getElementById("productDetails");
        if (detailsEl) detailsEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
}

function loadProductToUpdate(productId) {
    const product = productCache.get(productId);
    if (product) {
        displayProduct(product);
        prefillUpdateForm(product);
        switchTab("update");
    }
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
    const section = document.getElementById("inventoryOverviewSection");
    if (section) {
        section.scrollIntoView({ behavior: "smooth" });
    }
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
        switchTab("adjust");
        const adjustSection = document.getElementById("tab-pane-adjust");
        if (adjustSection) adjustSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

    showResult(`Submitting stock adjustment for Product #${productId}...`, "info", "SOAP: AdjustStock");

    const result = await callSoapService("adjustStock", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "Failed to communicate with SOAP service for stock adjustment.";
        showResult(errorMsg, "error", "SOAP: adjustStock");
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
        showResult(message, "success", "SOAP: adjustStock");
        renderSoapResponseCard("adjustStock", "SUCCESS", message, {
            id: productId,
            quantity: updatedQuantity !== null ? updatedQuantity : "Updated"
        }, result.rawXml);

        clearAdjustForm();

        // Refresh all products via SOAP getAllProducts
        await fetchAllProducts(false, `SOAP: Adjusted #${productId} -> ${updatedQuantity} units`);

        // Refresh stock movements via SOAP getStockMovements
        await fetchStockMovements(false);

        // If product was currently selected in detail card, refresh it
        const currentProd = productCache.get(productId);
        if (currentProd) {
            displayProduct(currentProd);
        }
    } else {
        showResult(message, "error", "SOAP: adjustStock");
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
                <span>Retrieving stock movement history from backend via SOAP getStockMovements (/ws)...</span>
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
        const errorMsg = result.fault || "SOAP service communication failure while loading stock movements.";
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
            showResult(errorMsg, "error", "SOAP: getStockMovements");
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
        showResult(`Retrieved ${movements.length} stock movement records from database.`, "success", "SOAP: getStockMovements");
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
                    <th style="width: 155px;">Timestamp</th>
                    <th>Product</th>
                    <th style="width: 130px;">Movement Type</th>
                    <th style="text-align: right; width: 90px;">Previous</th>
                    <th style="text-align: center; width: 100px;">Change</th>
                    <th style="text-align: right; width: 90px;">New Qty</th>
                    <th>Audit Reason / Note</th>
                    <th style="width: 120px;">Reference</th>
                </tr>
            </thead>
            <tbody>
    `;

    movements.forEach(m => {
        let typeBadge = "";
        if (m.movementType === "STOCK_IN") {
            typeBadge = `<span class="badge-movement badge-stock-in">⬇ STOCK IN</span>`;
        } else if (m.movementType === "STOCK_OUT") {
            typeBadge = `<span class="badge-movement badge-stock-out">⬆ STOCK OUT</span>`;
        } else if (m.movementType === "ADJUSTMENT") {
            typeBadge = `<span class="badge-movement badge-stock-adjust">⚖ ADJUSTMENT</span>`;
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
                        minute: "2-digit",
                        second: "2-digit"
                    });
                }
            }
        } catch (e) {
            formattedTime = m.timestamp;
        }

        const displayName = m.productName ? escapeXml(m.productName) : "(Deleted / Unnamed)";

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
    const section = document.getElementById("stockActivitySection");
    if (section) {
        section.scrollIntoView({ behavior: "smooth" });
    }
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
                    <th style="width: 95px;">Urgency</th>
                    <th style="text-align: center; width: 110px;">Suggested Qty</th>
                    <th>Recommendation Reason</th>
                    <th style="text-align: right; width: 140px;">Action</th>
                </tr>
            </thead>
            <tbody>
    `;

    candidates.forEach(c => {
        const isSelected = c.id === currentRestockSelectedProductId;
        const urgencyBadge = c.urgency === "CRITICAL"
            ? `<span class="urgency-badge badge-urgency-critical">🚨 CRITICAL</span>`
            : `<span class="urgency-badge badge-urgency-high">⚠️ HIGH</span>`;

        const weatherChip = (currentWeatherReport && currentWeatherReport.hasAdverseWeather && c.quantity === 0)
            ? `<span class="badge-weather-warning" title="Adverse weather at distribution hub may compound stockout replenishment duration">🌦️ Weather Risk</span>`
            : '';

        html += `
            <tr id="restock-row-${c.id}" class="${isSelected ? 'selected-candidate' : ''}">
                <td>#${c.id}</td>
                <td><strong>${escapeXml(c.name)}</strong>${weatherChip}</td>
                <td>${escapeXml(c.category)}</td>
                <td style="text-align: right; font-weight: 700; color: ${c.quantity === 0 ? 'var(--danger)' : 'var(--warning)'};">${c.quantity}</td>
                <td>${urgencyBadge}</td>
                <td style="text-align: center;"><span class="suggested-qty-pill">+${c.suggested}</span></td>
                <td style="font-size: 12px; color: var(--text-secondary); max-width: 220px;" title="${escapeXml(c.reason)}">${escapeXml(c.reason)}</td>
                <td style="text-align: right;">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="selectRestockCandidate(${c.id})">
                        🔍 Inspect Supplier
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
                <span>Querying Supplier Service via SOAP checkSupplierAvailability for Product #${productId}...</span>
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
        const errorMsg = result.fault || "Failed to contact Supplier Service via SOAP (/ws). Ensure Supplier Service is running on port 8081.";
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
                    <h3 class="table-empty-title">Supplier Data Unavailable</h3>
                    <p class="table-empty-desc">${escapeXml(errorMsg)}</p>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="selectRestockCandidate(${productId})">
                        🔄 Retry Supplier Query
                    </button>
                </div>
            `;
        }
        return;
    }

    const responseNode = getXmlNode(result.xmlDoc, "CheckSupplierAvailabilityResponse");
    const supplierName = getXmlValue(responseNode, "supplierName") || "Unknown Supplier";
    const availableQty = parseInt(getXmlValue(responseNode, "availableQuantity") || "0", 10);
    const supplierPrice = parseFloat(getXmlValue(responseNode, "supplierPrice") || "0.0");
    const available = getXmlValue(responseNode, "available").toLowerCase() === "true";

    // Fulfillability check
    const canFulfill = available && availableQty >= suggested;
    const partialFulfill = available && availableQty > 0 && availableQty < suggested;

    let fulfillBadge = "";
    if (canFulfill) {
        fulfillBadge = `<span class="fulfill-badge fulfill-full">✔ Full Fulfillment Possible (${availableQty} in stock)</span>`;
    } else if (partialFulfill) {
        fulfillBadge = `<span class="fulfill-badge fulfill-partial">⚠️ Partial Fulfillment (${availableQty} available / ${suggested - availableQty} short)</span>`;
    } else {
        fulfillBadge = `<span class="fulfill-badge fulfill-none">✖ Insufficient Stock (0 available)</span>`;
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

        <!-- Supplier Availability & Commercial Quote -->
        <div class="supplier-quote-box">
            <div class="supplier-quote-header">
                <span class="supplier-quote-title">🏢 ${escapeXml(supplierName)}</span>
                ${fulfillBadge}
            </div>

            <div class="quote-row">
                <span>Supplier Availability:</span>
                <strong>${available ? `${availableQty} units available` : 'Inactive / Unavailable'}</strong>
            </div>
            <div class="quote-row">
                <span>Supplier Unit Wholesale Price:</span>
                <strong style="color: var(--primary);">${available && supplierPrice > 0 ? '₹' + supplierPrice.toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '<span style="color: var(--text-muted);">N/A (Supplier Unavailable)</span>'}</strong>
            </div>
            <div class="quote-row">
                <span>Catalog Retail Price (INR):</span>
                <span>₹${product.price.toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>
            ${unitSavings > 0 ? `
            <div class="quote-row" style="color: var(--success);">
                <span>Estimated Unit Margin / Savings:</span>
                <strong>₹${unitSavings.toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${((unitSavings / product.price) * 100).toFixed(1)}%)</strong>
            </div>
            ` : ''}
            <div class="quote-row quote-row-total">
                <span>Estimated Total Procurement Cost (+${suggested} units):</span>
                <span>${available && supplierPrice > 0 ? '₹' + totalCost.toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '<span style="color: var(--text-muted);">Unavailable (Supplier Inactive)</span>'}</span>
            </div>
        </div>

        <!-- Currency Conversion Section (Base Currency: INR) -->
        <div class="currency-conversion-box">
            <div class="currency-conversion-header">
                <span>💱 Currency Conversion Context (Base: INR)</span>
                <span style="font-size: 11px; color: var(--text-muted);">Source: Frankfurter Live API</span>
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

        <!-- Simulated Restock Receipt -->
        <div class="simulated-receipt-box">
            <div class="simulated-receipt-title">
                <span>📥 Confirm Simulated Stock Receipt</span>
            </div>
            <p style="font-size: 12px; color: #065f46; margin-bottom: 10px;">
                Confirm receipt of replenishment units. This updates database stock via SOAP <code>AdjustStock</code> and persists an audited movement record in history.
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
                <span>📥 Confirm Simulated Receipt & Update Inventory</span>
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

    if (baseCurrency.toUpperCase() === targetCurrency.toUpperCase()) {
        resultEl.innerHTML = `₹${amount.toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})} INR (Same currency, rate: 1.0)`;
        return;
    }

    resultEl.innerHTML = `<span class="supplier-spinner">🔄</span> Fetching live rate...`;

    try {
        const res = await fetch(`https://api.frankfurter.dev/v1/latest?from=${baseCurrency}&to=${targetCurrency}`);
        if (!res.ok) throw new Error("API rate unavailable");
        const data = await res.json();
        if (data && data.rates && data.rates[targetCurrency]) {
            const rate = data.rates[targetCurrency];
            const converted = (amount * rate).toFixed(2);
            const symbol = targetCurrency === "USD" ? "$" : (targetCurrency === "EUR" ? "€" : "");
            resultEl.innerHTML = `<strong>${symbol}${Number(converted).toLocaleString()} ${targetCurrency}</strong> (Rate: ${rate.toFixed(4)}, Date: ${data.date || 'latest'})`;
        } else {
            resultEl.innerHTML = `<span style="color:var(--danger);">Rate unavailable</span>`;
        }
    } catch (err) {
        resultEl.innerHTML = `<span style="color:var(--text-muted); font-size:11px;">Frankfurter conversion unavailable (${err.message})</span>`;
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
        confirmBtn.innerHTML = `<span>🔄 Processing SOAP Stock Adjustment...</span>`;
    }

    showResult(`Submitting simulated restock receipt for #${productId} (+${qtyVal} units)...`, "info", "SOAP: AdjustStock");

    const soapPayload = `<inv:AdjustStockRequest>
        <inv:productId>${productId}</inv:productId>
        <inv:quantityChange>${qtyVal}</inv:quantityChange>
        <inv:reason>${escapeXml(reasonVal)}</inv:reason>
        <inv:reference>${escapeXml(refVal)}</inv:reference>
    </inv:AdjustStockRequest>`;

    const result = await callSoapService("adjustStock", soapPayload);

    if (!result.ok || !result.xmlDoc) {
        const errorMsg = result.fault || "Failed to confirm stock receipt via SOAP service.";
        showResult(errorMsg, "error", "SOAP: AdjustStock");
        renderSoapResponseCard("adjustStock", "FAULT", errorMsg, null, result.rawXml);
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `<span>📥 Confirm Simulated Receipt & Update Inventory</span>`;
        }
        return;
    }

    const responseNode = getXmlNode(result.xmlDoc, "AdjustStockResponse");
    const successStr = getXmlValue(responseNode, "success");
    const isSuccess = successStr.toLowerCase() === "true";
    const message = getXmlValue(responseNode, "message") || (isSuccess ? "Restock receipt confirmed successfully" : "Failed to record restock receipt");
    const updatedQuantityStr = getXmlValue(responseNode, "updatedQuantity");
    const updatedQuantity = updatedQuantityStr ? parseInt(updatedQuantityStr, 10) : null;

    if (isSuccess) {
        showResult(`Restock receipt recorded: +${qtyVal} units added to Product #${productId} (new balance: ${updatedQuantity} units).`, "success", "SOAP: AdjustStock");
        renderSoapResponseCard("adjustStock", "SUCCESS", message, {
            id: productId,
            quantity: updatedQuantity !== null ? updatedQuantity : "Updated"
        }, result.rawXml);

        // 1. Refresh inventory via getAllProducts
        await fetchAllProducts(false, `SOAP: Restock Receipt #${productId} (+${qtyVal})`);

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
        showResult(message, "error", "SOAP: AdjustStock");
        renderSoapResponseCard("adjustStock", "FAILED", message, { id: productId }, result.rawXml);
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = `<span>📥 Confirm Simulated Receipt & Update Inventory</span>`;
        }
    }
}

function scrollToSmartRestocking() {
    const section = document.getElementById("smartRestockingSection");
    if (section) {
        section.scrollIntoView({ behavior: "smooth" });
    }
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
                <span>Querying Open-Meteo forecast telemetry and evaluating operational rules via SOAP GetWeatherAdvisories...</span>
            </div>
        `;
    }

    const soapPayload = `<inv:GetWeatherAdvisoriesRequest>
        <inv:maxHorizonHours>${horizon}</inv:maxHorizonHours>
    </inv:GetWeatherAdvisoriesRequest>`;

    try {
        const result = await callSoapService("getWeatherAdvisories", soapPayload);

        if (!result.ok || !result.xmlDoc) {
            const errorMsg = result.fault || "Unable to retrieve meteorological advisories via SOAP /ws.";
            renderWeatherError(errorMsg);
            return;
        }

        const respNode = getXmlNode(result.xmlDoc, "GetWeatherAdvisoriesResponse");
        if (!respNode) {
            renderWeatherError("GetWeatherAdvisoriesResponse node missing in SOAP response.");
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
    if (hubCoords) hubCoords.textContent = `${report.latitude.toFixed(4)}° N, ${report.longitude.toFixed(4)}° E • Operational Hub`;
    if (hubRetrieval) hubRetrieval.textContent = `Telemetry Updated: ${report.retrievalTime}`;

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
            riskSummary.textContent = `${highCount} high-severity risk condition(s) detected across ${report.forecastHorizonHours}h forecast window.`;
            riskIcon.textContent = "🚨";
        } else if (warnCount > 0) {
            riskLevel.textContent = "MODERATE CAUTION";
            riskLevel.classList.add("level-warning");
            riskSummary.textContent = `${warnCount} operational weather warning(s) active across ${report.forecastHorizonHours}h horizon.`;
            riskIcon.textContent = "⚠️";
        } else {
            riskLevel.textContent = "NORMAL OPERATIONS";
            riskLevel.classList.add("level-safe");
            riskSummary.textContent = `No adverse weather conditions detected in next ${report.forecastHorizonHours} hours. Standard staging applies.`;
            riskIcon.textContent = "🛡️";
        }
    }

    if (cacheIndicator) {
        const isOffline = report.status.toLowerCase().includes("unavailable");
        cacheIndicator.textContent = isOffline ? "Service: Degraded / Fallback Mode" : "Status: Active Forecast Telemetry";
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
                    <span class="advisory-time-pill">Horizon: Next ${report.forecastHorizonHours} Hours</span>
                </div>
                <p class="advisory-desc">Meteorological model reports clear parameters within standard operational limits. No special staging protocols required.</p>
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
                    <span class="advisory-time-pill">⏰ Period: ${escapeXml(adv.expectedTime)}</span>
                </div>

                <p class="advisory-desc">${escapeXml(adv.description)}</p>

                ${adv.triggerConditions ? `
                <div class="advisory-metrics-box">
                    <span class="advisory-metrics-label">Trigger Telemetry:</span>
                    <span class="advisory-metrics-val">${escapeXml(adv.triggerConditions)}</span>
                </div>
                ` : ''}

                <div class="advisory-action-box">
                    <div class="advisory-action-header">📋 Recommended Operational Action</div>
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
            <h3>Weather Forecast Service Temporarily Unavailable</h3>
            <p>Unable to retrieve forecast telemetry from Open-Meteo API (${escapeXml(errorMessage)}). Operational weather risk cannot currently be refreshed.</p>
            <button type="button" class="btn btn-secondary btn-sm" onclick="fetchWeatherAdvisories(true)">
                🔄 Retry Meteorological Connection
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
    if (riskSummary) riskSummary.textContent = "Live forecast connection unavailable. Existing inventory workflows remain operational.";
    if (cacheIndicator) {
        cacheIndicator.textContent = "Status: API Connection Offline";
        cacheIndicator.style.color = "var(--danger)";
    }
}

function onWeatherHorizonChange() {
    fetchWeatherAdvisories(false);
}

function scrollToWeatherRisk() {
    const section = document.getElementById("weatherRiskSection");
    if (section) {
        section.scrollIntoView({ behavior: "smooth" });
    }
}