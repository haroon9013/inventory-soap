package com.example.inventory.endpoint;

import com.example.inventory.entity.ProductEntity;
import com.example.inventory.repository.ProductRepository;
import com.example.inventory.repository.StockMovementRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
public class InventorySoapEndpointIntegrationTest {

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private StockMovementRepository stockMovementRepository;

    private static final String SOAP_NS = "http://example.com/inventory";

    @BeforeEach
    void setUp() {
        stockMovementRepository.deleteAll();
        productRepository.deleteAll();
    }

    private HttpHeaders createSoapHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.TEXT_XML);
        return headers;
    }

    private String wrapSoapEnvelope(String bodyContent) {
        return "<?xml version=\"1.0\" encoding=\"utf-8\"?>" +
                "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:inv=\"" + SOAP_NS + "\">" +
                "  <soapenv:Header/>" +
                "  <soapenv:Body>" +
                bodyContent +
                "  </soapenv:Body>" +
                "</soapenv:Envelope>";
    }

    @Test
    void testWsdlEndpointAvailableAndContainsInventoryNamespace() {
        ResponseEntity<String> response = restTemplate.getForEntity("/ws/inventory.wsdl", String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains(SOAP_NS), "WSDL must define inventory namespace");
        assertTrue(response.getBody().contains("GetAllProductsRequest"), "WSDL must contain GetAllProducts operation");
        assertTrue(response.getBody().contains("AdjustStockRequest"), "WSDL must contain AdjustStock operation");
        assertTrue(response.getBody().contains("GetWeatherAdvisoriesRequest"), "WSDL must contain GetWeatherAdvisories operation");
    }

    @Test
    void testGetAllProductsSoapRequest() {
        productRepository.save(new ProductEntity(601, "SOAP Product 1", 12, 999.0, "TestCategory"));

        String xml = wrapSoapEnvelope("<inv:GetAllProductsRequest/>");
        HttpEntity<String> entity = new HttpEntity<>(xml, createSoapHeaders());

        ResponseEntity<String> response = restTemplate.postForEntity("/ws", entity, String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("GetAllProductsResponse"));
        assertTrue(response.getBody().contains("SOAP Product 1"));
        assertTrue(response.getBody().contains("<id>601</id>") || response.getBody().contains(">601<"));
        assertTrue(response.getBody().contains("<quantity>12</quantity>") || response.getBody().contains(">12<"));
    }

    @Test
    void testAddProductSoapRequest() {
        String xml = wrapSoapEnvelope(
                "<inv:AddProductRequest>" +
                "  <inv:product>" +
                "    <inv:id>602</inv:id>" +
                "    <inv:name>Wireless Mouse</inv:name>" +
                "    <inv:quantity>25</inv:quantity>" +
                "    <inv:price>799.0</inv:price>" +
                "    <inv:category>Accessories</inv:category>" +
                "  </inv:product>" +
                "</inv:AddProductRequest>"
        );
        HttpEntity<String> entity = new HttpEntity<>(xml, createSoapHeaders());

        ResponseEntity<String> response = restTemplate.postForEntity("/ws", entity, String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("AddProductResponse"));
        assertTrue(response.getBody().contains("true"));
        assertTrue(response.getBody().contains("Product added successfully"));

        assertTrue(productRepository.existsById(602));
    }

    @Test
    void testAdjustStockValidSoapRequest() {
        productRepository.save(new ProductEntity(603, "Office Desk", 10, 8500.0, "Furniture"));

        String xml = wrapSoapEnvelope(
                "<inv:AdjustStockRequest>" +
                "  <inv:productId>603</inv:productId>" +
                "  <inv:quantityChange>5</inv:quantityChange>" +
                "  <inv:reason>Restock Shipment Received</inv:reason>" +
                "  <inv:reference>PO-603</inv:reference>" +
                "</inv:AdjustStockRequest>"
        );
        HttpEntity<String> entity = new HttpEntity<>(xml, createSoapHeaders());

        ResponseEntity<String> response = restTemplate.postForEntity("/ws", entity, String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("AdjustStockResponse"));
        assertTrue(response.getBody().contains("<success>true</success>") || response.getBody().contains(">true<"));
        assertTrue(response.getBody().contains("<previousQuantity>10</previousQuantity>") || response.getBody().contains(">10<"));
        assertTrue(response.getBody().contains("<updatedQuantity>15</updatedQuantity>") || response.getBody().contains(">15<"));
        assertTrue(response.getBody().contains("ADJUSTMENT"));

        ProductEntity updated = productRepository.findById(603).orElseThrow();
        assertEquals(15, updated.getQuantity());
    }

    @Test
    void testAdjustStockInvalidConflictingInputsRejected() {
        productRepository.save(new ProductEntity(604, "Gaming Keyboard", 10, 3200.0, "Peripherals"));

        String xml = wrapSoapEnvelope(
                "<inv:AdjustStockRequest>" +
                "  <inv:productId>604</inv:productId>" +
                "  <inv:quantityChange>5</inv:quantityChange>" +
                "  <inv:targetQuantity>30</inv:targetQuantity>" +
                "  <inv:reason>Conflicting inputs</inv:reason>" +
                "</inv:AdjustStockRequest>"
        );
        HttpEntity<String> entity = new HttpEntity<>(xml, createSoapHeaders());

        ResponseEntity<String> response = restTemplate.postForEntity("/ws", entity, String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("AdjustStockResponse"));
        assertTrue(response.getBody().contains("<success>false</success>") || response.getBody().contains(">false<"));
        assertTrue(response.getBody().contains("Cannot specify both"));

        ProductEntity unchanged = productRepository.findById(604).orElseThrow();
        assertEquals(10, unchanged.getQuantity());
    }

    @Test
    void testAdjustStockNegativeResultRejected() {
        productRepository.save(new ProductEntity(605, "Monitor", 3, 14000.0, "Displays"));

        String xml = wrapSoapEnvelope(
                "<inv:AdjustStockRequest>" +
                "  <inv:productId>605</inv:productId>" +
                "  <inv:quantityChange>-10</inv:quantityChange>" +
                "  <inv:reason>Attempted deficit</inv:reason>" +
                "</inv:AdjustStockRequest>"
        );
        HttpEntity<String> entity = new HttpEntity<>(xml, createSoapHeaders());

        ResponseEntity<String> response = restTemplate.postForEntity("/ws", entity, String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("AdjustStockResponse"));
        assertTrue(response.getBody().contains("<success>false</success>") || response.getBody().contains(">false<"));
        assertTrue(response.getBody().contains("negative"));
    }

    @Test
    void testGetStockMovementsSoapRequest() {
        productRepository.save(new ProductEntity(606, "Webcam", 5, 2500.0, "Accessories"));

        // Adjust stock to create a movement
        String adjustXml = wrapSoapEnvelope(
                "<inv:AdjustStockRequest>" +
                "  <inv:productId>606</inv:productId>" +
                "  <inv:quantityChange>3</inv:quantityChange>" +
                "  <inv:reason>Initial batch adjustment</inv:reason>" +
                "</inv:AdjustStockRequest>"
        );
        restTemplate.postForEntity("/ws", new HttpEntity<>(adjustXml, createSoapHeaders()), String.class);

        // Fetch movements
        String xml = wrapSoapEnvelope(
                "<inv:GetStockMovementsRequest>" +
                "  <inv:productId>606</inv:productId>" +
                "  <inv:maxRecords>10</inv:maxRecords>" +
                "</inv:GetStockMovementsRequest>"
        );
        ResponseEntity<String> response = restTemplate.postForEntity("/ws", new HttpEntity<>(xml, createSoapHeaders()), String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("GetStockMovementsResponse"));
        assertTrue(response.getBody().contains("Webcam"));
        assertTrue(response.getBody().contains("ADJUSTMENT"));
    }

    @Test
    void testGetWeatherAdvisoriesSoapRequest() {
        String xml = wrapSoapEnvelope(
                "<inv:GetWeatherAdvisoriesRequest>" +
                "  <inv:maxHorizonHours>24</inv:maxHorizonHours>" +
                "</inv:GetWeatherAdvisoriesRequest>"
        );
        ResponseEntity<String> response = restTemplate.postForEntity("/ws", new HttpEntity<>(xml, createSoapHeaders()), String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("GetWeatherAdvisoriesResponse"));
        assertTrue(response.getBody().contains("Mumbai Central Distribution Hub"));
    }

    @Test
    void testUnknownProductIdHandledGracefully() {
        String xml = wrapSoapEnvelope(
                "<inv:GetProductRequest>" +
                "  <inv:id>99999</inv:id>" +
                "</inv:GetProductRequest>"
        );
        ResponseEntity<String> response = restTemplate.postForEntity("/ws", new HttpEntity<>(xml, createSoapHeaders()), String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().contains("GetProductResponse"));
        assertTrue(response.getBody().contains("<success>false</success>") || response.getBody().contains(">false<"));
        assertTrue(response.getBody().contains("not found"));
    }

    @Test
    void testInvalidXmlReturnsError() {
        String malformedXml = "<malformed>Not a SOAP envelope</malformed>";
        HttpEntity<String> entity = new HttpEntity<>(malformedXml, createSoapHeaders());

        ResponseEntity<String> response = restTemplate.postForEntity("/ws", entity, String.class);
        assertTrue(response.getStatusCode().is5xxServerError() || response.getStatusCode().is4xxClientError());
        assertNotNull(response.getBody());
    }
}
