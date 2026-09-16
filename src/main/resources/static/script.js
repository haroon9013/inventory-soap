// ==========================================================================
// Inventory Management System - Client Application Logic (SOAP 1.1 Web Services)
// All CRUD and External Orchestration operations communicate via POST /ws
// ==========================================================================

// Client-side cache to track products during active session
const productCache = new Map();

// Initialize on page load
document.addEventListener("DOMContentLoaded", () => {
    updateStatistics("System Ready");
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
        productCache.set(product.id, product);
        updateStatistics("SOAP Added #" + product.id);
        displayProduct(product);
        clearAddForm();
        showResult(message, "success", "SOAP: addProduct");
        renderSoapResponseCard("addProduct", "SUCCESS", message, product, result.rawXml);
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
        productCache.set(product.id, product);
        updateStatistics("SOAP Updated #" + product.id);
        displayProduct(product);
        clearUpdateForm();
        showResult(message, "success", "SOAP: updateProduct");
        renderSoapResponseCard("updateProduct", "SUCCESS", message, product, result.rawXml);
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
        productCache.delete(id);
        updateStatistics("SOAP Deleted #" + id);
        showResult(message, "success", "SOAP: deleteProduct");
        renderSoapResponseCard("deleteProduct", "SUCCESS", message, { id: id }, result.rawXml);
        document.getElementById("deleteId").value = "";

        const badge = document.getElementById("detailsStatusBadge");
        if (badge) {
            badge.textContent = "Deleted";
            badge.style.backgroundColor = "#fef2f2";
            badge.style.color = "#dc2626";
        }
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
                    <div class="ext-stat-row"><span>Converted Price:</span> <strong>$${convertedPrice.toLocaleString("en-US", {minimumFractionDigits: 2})} USD</strong></div>
                    <div class="ext-stat-row"><span>Formula:</span> <code>${prodPrice} × ${exRate}</code></div>
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