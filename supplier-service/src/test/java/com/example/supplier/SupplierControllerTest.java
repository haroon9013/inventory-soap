package com.example.supplier;

import com.example.supplier.controller.SupplierController;
import com.example.supplier.model.SupplierAvailability;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.*;

class SupplierControllerTest {

    private final SupplierController controller = new SupplierController();

    @Test
    void testCheckSupplierAvailabilityKnownProduct() {
        ResponseEntity<SupplierAvailability> response = controller.checkSupplierAvailability(101);

        assertNotNull(response.getBody());
        assertEquals(101, response.getBody().getProductId());
        assertEquals("Global Tech Logistics", response.getBody().getSupplierName());
        assertEquals(150, response.getBody().getAvailableQuantity());
        assertEquals(48000.0, response.getBody().getSupplierPrice());
        assertTrue(response.getBody().isAvailable());
    }

    @Test
    void testCheckSupplierAvailabilityUnavailableProduct() {
        ResponseEntity<SupplierAvailability> response = controller.checkSupplierAvailability(999);

        assertNotNull(response.getBody());
        assertEquals(999, response.getBody().getProductId());
        assertFalse(response.getBody().isAvailable());
        assertEquals(0, response.getBody().getAvailableQuantity());
    }

    @Test
    void testCheckSupplierAvailabilityDynamicFallback() {
        ResponseEntity<SupplierAvailability> response = controller.checkSupplierAvailability(505);

        assertNotNull(response.getBody());
        assertEquals(505, response.getBody().getProductId());
        assertTrue(response.getBody().isAvailable());
        assertTrue(response.getBody().getAvailableQuantity() > 0);
    }
}
