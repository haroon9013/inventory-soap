package com.example.inventory.service;

import com.example.inventory.client.FrankfurterClient;
import com.example.inventory.client.OpenMeteoClient;
import com.example.inventory.client.SupplierClient;
import com.example.inventory.dto.CurrencyInfoDto;
import com.example.inventory.dto.ProductExternalInfoDto;
import com.example.inventory.dto.SupplierAvailabilityDto;
import com.example.inventory.dto.WarehouseForecastReportDto;
import com.example.inventory.dto.WeatherAdvisoryDto;
import com.example.inventory.dto.WeatherInfoDto;
import com.example.inventory.entity.ProductEntity;
import com.example.inventory.entity.StockMovementEntity;
import com.example.inventory.generated.AdjustStockResponse;
import com.example.inventory.generated.GetWeatherAdvisoriesResponse;
import com.example.inventory.generated.Product;
import com.example.inventory.generated.StockMovement;
import com.example.inventory.generated.WeatherAdvisory;
import com.example.inventory.repository.ProductRepository;
import com.example.inventory.repository.StockMovementRepository;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.*;

class InventoryServiceTest {

    private ProductRepository productRepository;
    private StockMovementRepository stockMovementRepository;
    private SupplierClient supplierClient;
    private FrankfurterClient frankfurterClient;
    private OpenMeteoClient openMeteoClient;
    private InventoryService inventoryService;

    @BeforeEach
    void setUp() {
        productRepository = mock(ProductRepository.class);
        stockMovementRepository = mock(StockMovementRepository.class);
        supplierClient = mock(SupplierClient.class);
        frankfurterClient = mock(FrankfurterClient.class);
        openMeteoClient = mock(OpenMeteoClient.class);
        inventoryService = new InventoryService(productRepository, stockMovementRepository, supplierClient, frankfurterClient, openMeteoClient);
    }

    private Product createProduct(int id, String name, int quantity, double price, String category) {
        Product product = new Product();
        product.setId(id);
        product.setName(name);
        product.setQuantity(quantity);
        product.setPrice(price);
        product.setCategory(category);
        return product;
    }

    private ProductEntity createEntity(int id, String name, int quantity, double price, String category) {
        return new ProductEntity(id, name, quantity, price, category);
    }

    @Test
    void testAddProduct() {
        Product product = createProduct(101, "Laptop", 10, 55000.0, "Electronics");
        when(productRepository.existsById(101)).thenReturn(false);

        boolean added = inventoryService.addProduct(product);

        assertTrue(added);
        verify(productRepository).save(any(ProductEntity.class));
    }

    @Test
    void testAddDuplicateProduct() {
        Product product = createProduct(101, "Laptop", 10, 55000.0, "Electronics");
        when(productRepository.existsById(101)).thenReturn(true);

        boolean added = inventoryService.addProduct(product);

        assertFalse(added);
        verify(productRepository, never()).save(any(ProductEntity.class));
    }

    @Test
    void testGetExistingProduct() {
        ProductEntity entity = createEntity(101, "Laptop", 10, 55000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(entity));

        Optional<Product> retrieved = inventoryService.getProduct(101);

        assertTrue(retrieved.isPresent());
        assertEquals(101, retrieved.get().getId());
        assertEquals("Laptop", retrieved.get().getName());
        assertEquals(10, retrieved.get().getQuantity());
        assertEquals(55000.0, retrieved.get().getPrice());
        assertEquals("Electronics", retrieved.get().getCategory());
        verify(productRepository).findById(101);
    }

    @Test
    void testGetNonexistentProduct() {
        when(productRepository.findById(999)).thenReturn(Optional.empty());

        Optional<Product> retrieved = inventoryService.getProduct(999);

        assertFalse(retrieved.isPresent());
        verify(productRepository).findById(999);
    }

    @Test
    void testUpdateExistingProduct() {
        Product updated = createProduct(101, "Laptop Pro", 15, 60000.0, "Electronics");
        when(productRepository.existsById(101)).thenReturn(true);

        boolean updateResult = inventoryService.updateProduct(updated);

        assertTrue(updateResult);
        verify(productRepository).save(any(ProductEntity.class));
    }

    @Test
    void testUpdateNonexistentProduct() {
        Product product = createProduct(999, "Unknown", 5, 1000.0, "Misc");
        when(productRepository.existsById(999)).thenReturn(false);

        boolean updateResult = inventoryService.updateProduct(product);

        assertFalse(updateResult);
        verify(productRepository, never()).save(any(ProductEntity.class));
    }

    @Test
    void testDeleteExistingProduct() {
        when(productRepository.existsById(101)).thenReturn(true);

        boolean deleteResult = inventoryService.deleteProduct(101);

        assertTrue(deleteResult);
        verify(productRepository).deleteById(101);
    }

    @Test
    void testDeleteNonexistentProduct() {
        when(productRepository.existsById(999)).thenReturn(false);

        boolean deleteResult = inventoryService.deleteProduct(999);

        assertFalse(deleteResult);
        verify(productRepository, never()).deleteById(anyInt());
    }

    @Test
    void testCheckSupplierAvailability() {
        SupplierAvailabilityDto mockDto = new SupplierAvailabilityDto(
                101,
                "Global Tech Logistics",
                150,
                48000.0,
                true,
                "Retrieved from Supplier Service"
        );
        when(supplierClient.checkSupplierAvailability(101)).thenReturn(mockDto);

        SupplierAvailabilityDto result = inventoryService.checkSupplierAvailability(101);

        assertNotNull(result);
        assertEquals(101, result.getProductId());
        assertEquals("Global Tech Logistics", result.getSupplierName());
        assertEquals(150, result.getAvailableQuantity());
        assertEquals(48000.0, result.getSupplierPrice());
        assertTrue(result.isAvailable());
        verify(supplierClient).checkSupplierAvailability(101);
    }

    @Test
    void testCheckSupplierAvailabilityFallbackWhenClientNull() {
        InventoryService serviceWithoutClient = new InventoryService(productRepository);

        SupplierAvailabilityDto result = serviceWithoutClient.checkSupplierAvailability(101);

        assertNotNull(result);
        assertFalse(result.isAvailable());
        assertEquals("Supplier Service Not Configured", result.getSupplierName());
    }

    @Test
    void testGetProductExternalInfoSuccess() {
        ProductEntity entity = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(entity));

        SupplierAvailabilityDto mockSupplier = new SupplierAvailabilityDto(
                101, "Global Tech Logistics", 150, 48000.0, true, "OK"
        );
        when(supplierClient.checkSupplierAvailability(101)).thenReturn(mockSupplier);

        CurrencyInfoDto mockCurrency = new CurrencyInfoDto(
                "EUR", "USD", 1.15, 57500.0, "SUCCESS: Live rate"
        );
        when(frankfurterClient.convertCurrency(50000.0, "EUR", "USD")).thenReturn(mockCurrency);

        WeatherInfoDto mockWeather = new WeatherInfoDto(
                "Mumbai Central Distribution Hub", 28.5, 12.0, "Partly Cloudy", "SUCCESS: Live weather"
        );
        when(openMeteoClient.getWarehouseWeather()).thenReturn(mockWeather);

        ProductExternalInfoDto result = inventoryService.getProductExternalInfo(101);

        assertNotNull(result);
        assertTrue(result.isSuccess());
        assertEquals("Product external information retrieved successfully", result.getMessage());

        // Product verification
        assertNotNull(result.getProduct());
        assertEquals(101, result.getProduct().getId());
        assertEquals("Laptop", result.getProduct().getName());
        assertEquals(50000.0, result.getProduct().getPrice());

        // Supplier verification
        assertNotNull(result.getSupplierInfo());
        assertEquals("Global Tech Logistics", result.getSupplierInfo().getSupplierName());
        assertEquals(150, result.getSupplierInfo().getAvailableQuantity());
        assertTrue(result.getSupplierInfo().isAvailable());

        // Currency verification
        assertNotNull(result.getCurrencyInfo());
        assertEquals("EUR", result.getCurrencyInfo().getBaseCurrency());
        assertEquals("USD", result.getCurrencyInfo().getTargetCurrency());
        assertEquals(1.15, result.getCurrencyInfo().getExchangeRate());
        assertEquals(57500.0, result.getCurrencyInfo().getConvertedPrice());

        // Weather verification
        assertNotNull(result.getWeatherInfo());
        assertEquals("Mumbai Central Distribution Hub", result.getWeatherInfo().getLocation());
        assertEquals(28.5, result.getWeatherInfo().getTemperature());
        assertEquals("Partly Cloudy", result.getWeatherInfo().getWeatherCondition());
    }

    @Test
    void testGetProductExternalInfoProductNotFound() {
        when(productRepository.findById(999)).thenReturn(Optional.empty());

        ProductExternalInfoDto result = inventoryService.getProductExternalInfo(999);

        assertNotNull(result);
        assertFalse(result.isSuccess());
        assertEquals("Product with ID 999 not found", result.getMessage());
        assertNull(result.getProduct());
        assertNull(result.getSupplierInfo());
        assertNull(result.getCurrencyInfo());
        assertNull(result.getWeatherInfo());
        verify(supplierClient, never()).checkSupplierAvailability(anyInt());
    }

    @Test
    void testGetProductExternalInfoWithExternalApiFailuresHandledGracefully() {
        ProductEntity entity = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(entity));

        // Supplier failure fallback
        when(supplierClient.checkSupplierAvailability(101)).thenReturn(
                new SupplierAvailabilityDto(101, "Supplier Service Unavailable", 0, 0.0, false, "Timeout")
        );

        // Frankfurter failure fallback
        when(frankfurterClient.convertCurrency(50000.0, "EUR", "USD")).thenReturn(
                new CurrencyInfoDto("EUR", "USD", 0.0, 50000.0, "UNAVAILABLE: Connection timeout")
        );

        // Open-Meteo failure fallback
        when(openMeteoClient.getWarehouseWeather()).thenReturn(
                new WeatherInfoDto("Mumbai Hub", 0.0, 0.0, "Unknown", "UNAVAILABLE: Connection timeout")
        );

        ProductExternalInfoDto result = inventoryService.getProductExternalInfo(101);

        assertNotNull(result);
        assertTrue(result.isSuccess()); // Database product found, graceful fallbacks provided
        assertNotNull(result.getProduct());
        assertFalse(result.getSupplierInfo().isAvailable());
        assertEquals(0.0, result.getCurrencyInfo().getExchangeRate());
        assertTrue(result.getCurrencyInfo().getStatus().contains("UNAVAILABLE"));
        assertTrue(result.getWeatherInfo().getStatus().contains("UNAVAILABLE"));
    }

    @Test
    void testGetProductExternalInfoWithNullClients() {
        InventoryService standaloneService = new InventoryService(productRepository);
        ProductEntity entity = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(entity));

        ProductExternalInfoDto result = standaloneService.getProductExternalInfo(101);

        assertNotNull(result);
        assertTrue(result.isSuccess());
        assertNotNull(result.getProduct());
        assertNotNull(result.getSupplierInfo());
        assertNotNull(result.getCurrencyInfo());
        assertNotNull(result.getWeatherInfo());
    }

    @Test
    void testGetAllProductsEmpty() {
        when(productRepository.findAll()).thenReturn(List.of());

        List<Product> products = inventoryService.getAllProducts();

        assertNotNull(products);
        assertTrue(products.isEmpty());
        verify(productRepository).findAll();
    }

    @Test
    void testGetAllProductsPopulated() {
        ProductEntity e1 = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        ProductEntity e2 = createEntity(102, "Wireless Mouse", 30, 1500.0, "Peripherals");
        when(productRepository.findAll()).thenReturn(List.of(e1, e2));

        List<Product> products = inventoryService.getAllProducts();

        assertNotNull(products);
        assertEquals(2, products.size());
        assertEquals(101, products.get(0).getId());
        assertEquals("Laptop", products.get(0).getName());
        assertEquals(102, products.get(1).getId());
        assertEquals("Wireless Mouse", products.get(1).getName());
        verify(productRepository).findAll();
    }

    @Test
    void testGetAllProductsFieldMapping() {
        ProductEntity entity = createEntity(205, "Mechanical Gaming Keyboard", 4, 4999.50, "Hardware");
        when(productRepository.findAll()).thenReturn(List.of(entity));

        List<Product> products = inventoryService.getAllProducts();

        assertNotNull(products);
        assertEquals(1, products.size());
        Product product = products.get(0);
        assertEquals(205, product.getId());
        assertEquals("Mechanical Gaming Keyboard", product.getName());
        assertEquals(4, product.getQuantity());
        assertEquals(4999.50, product.getPrice());
        assertEquals("Hardware", product.getCategory());
        verify(productRepository).findAll();
    }

    @Test
    void testAddProductWithInitialStockCreatesStockInMovement() {
        Product product = createProduct(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.existsById(101)).thenReturn(false);

        boolean added = inventoryService.addProduct(product);

        assertTrue(added);
        verify(productRepository).save(any(ProductEntity.class));
        verify(stockMovementRepository).save(argThat(m ->
                m.getProductId() == 101 &&
                m.getMovementType().equals("STOCK_IN") &&
                m.getPreviousQuantity() == 0 &&
                m.getNewQuantity() == 10 &&
                m.getQuantityChange() == 10
        ));
    }

    @Test
    void testAddProductWithZeroInitialStockCreatesNoMovement() {
        Product product = createProduct(102, "Monitor", 0, 15000.0, "Electronics");
        when(productRepository.existsById(102)).thenReturn(false);

        boolean added = inventoryService.addProduct(product);

        assertTrue(added);
        verify(productRepository).save(any(ProductEntity.class));
        verify(stockMovementRepository, never()).save(any(StockMovementEntity.class));
    }

    @Test
    void testUpdateProductStockIncreaseCreatesStockInMovement() {
        when(productRepository.existsById(101)).thenReturn(true);
        ProductEntity existing = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));

        Product update = createProduct(101, "Laptop", 15, 50000.0, "Electronics");
        boolean updated = inventoryService.updateProduct(update);

        assertTrue(updated);
        verify(stockMovementRepository).save(argThat(m ->
                m.getProductId() == 101 &&
                m.getMovementType().equals("STOCK_IN") &&
                m.getPreviousQuantity() == 10 &&
                m.getNewQuantity() == 15 &&
                m.getQuantityChange() == 5
        ));
    }

    @Test
    void testUpdateProductStockDecreaseCreatesStockOutMovement() {
        when(productRepository.existsById(101)).thenReturn(true);
        ProductEntity existing = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));

        Product update = createProduct(101, "Laptop", 4, 50000.0, "Electronics");
        boolean updated = inventoryService.updateProduct(update);

        assertTrue(updated);
        verify(stockMovementRepository).save(argThat(m ->
                m.getProductId() == 101 &&
                m.getMovementType().equals("STOCK_OUT") &&
                m.getPreviousQuantity() == 10 &&
                m.getNewQuantity() == 4 &&
                m.getQuantityChange() == -6
        ));
    }

    @Test
    void testUpdateProductPriceOnlyCreatesNoMovement() {
        when(productRepository.existsById(101)).thenReturn(true);
        ProductEntity existing = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));

        Product update = createProduct(101, "Laptop Pro", 10, 55000.0, "Computing");
        boolean updated = inventoryService.updateProduct(update);

        assertTrue(updated);
        verify(stockMovementRepository, never()).save(any(StockMovementEntity.class));
    }

    @Test
    void testAdjustStockTargetQuantitySuccess() {
        ProductEntity existing = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));

        AdjustStockResponse res = inventoryService.adjustStock(101, null, 25, "Restock batch arrived", "PO-1001");

        assertTrue(res.isSuccess());
        assertEquals(101, res.getProductId());
        assertEquals(10, res.getPreviousQuantity());
        assertEquals(25, res.getUpdatedQuantity());
        assertNotNull(res.getMovement());
        assertEquals("ADJUSTMENT", res.getMovement().getMovementType());
        assertEquals(15, res.getMovement().getQuantityChange());
        verify(stockMovementRepository).save(argThat(m ->
                m.getMovementType().equals("ADJUSTMENT") &&
                m.getQuantityChange() == 15 &&
                m.getNewQuantity() == 25 &&
                m.getReason().equals("Restock batch arrived")
        ));
    }

    @Test
    void testAdjustStockQuantityChangeSuccess() {
        ProductEntity existing = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));

        AdjustStockResponse res = inventoryService.adjustStock(101, -3, null, "Damaged in warehouse", "DMG-55");

        assertTrue(res.isSuccess());
        assertEquals(10, res.getPreviousQuantity());
        assertEquals(7, res.getUpdatedQuantity());
        assertEquals(-3, res.getMovement().getQuantityChange());
        verify(stockMovementRepository).save(argThat(m ->
                m.getMovementType().equals("ADJUSTMENT") &&
                m.getQuantityChange() == -3 &&
                m.getNewQuantity() == 7
        ));
    }

    @Test
    void testAdjustStockRejectsNegativeQuantity() {
        ProductEntity existing = createEntity(101, "Laptop", 5, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));

        AdjustStockResponse res = inventoryService.adjustStock(101, -10, null, "Counting mistake", null);

        assertFalse(res.isSuccess());
        assertTrue(res.getMessage().contains("negative"));
        assertEquals(5, res.getPreviousQuantity());
        assertEquals(5, res.getUpdatedQuantity());
        verify(stockMovementRepository, never()).save(any(StockMovementEntity.class));
    }

    @Test
    void testAdjustStockProductNotFound() {
        when(productRepository.findById(999)).thenReturn(Optional.empty());

        AdjustStockResponse res = inventoryService.adjustStock(999, 5, null, "Test", null);

        assertFalse(res.isSuccess());
        assertTrue(res.getMessage().contains("not found"));
        verify(stockMovementRepository, never()).save(any(StockMovementEntity.class));
    }

    @Test
    void testAdjustStockNoQuantityProvided() {
        ProductEntity existing = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));

        AdjustStockResponse res = inventoryService.adjustStock(101, null, null, "Missing params", null);

        assertFalse(res.isSuccess());
        verify(stockMovementRepository, never()).save(any(StockMovementEntity.class));
    }

    @Test
    void testAdjustStockRejectsConflictingInputsBothProvided() {
        ProductEntity existing = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));

        AdjustStockResponse res = inventoryService.adjustStock(101, 5, 20, "Conflicting inputs", null);

        assertFalse(res.isSuccess());
        assertTrue(res.getMessage().contains("Cannot specify both"));
        assertEquals(10, res.getPreviousQuantity());
        assertEquals(10, res.getUpdatedQuantity());
        verify(stockMovementRepository, never()).save(any(StockMovementEntity.class));
    }

    @Test
    void testAdjustStockRejectsNegativeTargetQuantity() {
        ProductEntity existing = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));

        AdjustStockResponse res = inventoryService.adjustStock(101, null, -5, "Negative target", null);

        assertFalse(res.isSuccess());
        assertTrue(res.getMessage().contains("negative"));
        assertEquals(10, res.getPreviousQuantity());
        assertEquals(10, res.getUpdatedQuantity());
        verify(stockMovementRepository, never()).save(any(StockMovementEntity.class));
    }

    @Test
    void testAdjustStockOptimisticLockingConflictReturnsErrorResponse() {
        ProductEntity existing = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));
        when(productRepository.save(any(ProductEntity.class))).thenThrow(
                new org.springframework.orm.ObjectOptimisticLockingFailureException(ProductEntity.class, 101)
        );

        AdjustStockResponse res = inventoryService.adjustStock(101, 5, null, "Concurrent test", null);

        assertFalse(res.isSuccess());
        assertTrue(res.getMessage().contains("Concurrency conflict"));
        assertEquals(101, res.getProductId());
        assertEquals(10, res.getPreviousQuantity());
        assertEquals(10, res.getUpdatedQuantity());
    }

    @Test
    void testUpdateProductOptimisticLockingConflictReturnsFalse() {
        when(productRepository.existsById(101)).thenReturn(true);
        ProductEntity existing = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));
        when(productRepository.save(any(ProductEntity.class))).thenThrow(
                new org.springframework.orm.ObjectOptimisticLockingFailureException(ProductEntity.class, 101)
        );

        Product update = createProduct(101, "Laptop Pro", 15, 60000.0, "Electronics");
        boolean updated = inventoryService.updateProduct(update);

        assertFalse(updated);
        verify(stockMovementRepository, never()).save(any(StockMovementEntity.class));
    }

    @Test
    void testDeleteProductRecordsStockOutMovementAndDeletesEntity() {
        ProductEntity existing = createEntity(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));

        boolean deleted = inventoryService.deleteProduct(101);

        assertTrue(deleted);
        verify(stockMovementRepository).save(argThat(m ->
                m.getProductId() == 101 &&
                m.getMovementType().equals("STOCK_OUT") &&
                m.getPreviousQuantity() == 10 &&
                m.getNewQuantity() == 0 &&
                m.getQuantityChange() == -10 &&
                m.getReference().equals("DELETE_PRODUCT")
        ));
        verify(productRepository).deleteById(101);
    }

    @Test
    void testGetStockMovementsAll() {
        StockMovementEntity m1 = new StockMovementEntity(101, "Laptop", "STOCK_IN", 0, 10, 10, "Initial", LocalDateTime.now(), "ADD");
        when(stockMovementRepository.findAllByOrderByTimestampDescIdDesc(any(Pageable.class))).thenReturn(List.of(m1));

        List<StockMovement> list = inventoryService.getStockMovements(null, 50);

        assertNotNull(list);
        assertEquals(1, list.size());
        assertEquals(101, list.get(0).getProductId());
        assertEquals("Laptop", list.get(0).getProductName());
        verify(stockMovementRepository).findAllByOrderByTimestampDescIdDesc(any(Pageable.class));
    }

    @Test
    void testGetStockMovementsFilteredByProduct() {
        StockMovementEntity m1 = new StockMovementEntity(202, "Desk Chair", "ADJUSTMENT", 5, 8, 3, "Audit", LocalDateTime.now(), "AUD");
        when(stockMovementRepository.findByProductIdOrderByTimestampDescIdDesc(eq(202), any(Pageable.class))).thenReturn(List.of(m1));

        List<StockMovement> list = inventoryService.getStockMovements(202, 10);

        assertNotNull(list);
        assertEquals(1, list.size());
        assertEquals(202, list.get(0).getProductId());
        assertEquals("Desk Chair", list.get(0).getProductName());
        assertEquals(3, list.get(0).getQuantityChange());
        verify(stockMovementRepository).findByProductIdOrderByTimestampDescIdDesc(eq(202), any(Pageable.class));
    }

    @Test
    void testDeleteProductPreservesHistoricalStockMovements() {
        when(productRepository.existsById(101)).thenReturn(true);

        boolean deleted = inventoryService.deleteProduct(101);

        assertTrue(deleted);
        verify(productRepository).deleteById(101);
        verifyNoInteractions(stockMovementRepository);
    }

    @Test
    void testFailedAddDoesNotCreateMovement() {
        Product product = createProduct(101, "Laptop", 10, 50000.0, "Electronics");
        when(productRepository.existsById(101)).thenReturn(true);

        boolean added = inventoryService.addProduct(product);

        assertFalse(added);
        verify(productRepository, never()).save(any(ProductEntity.class));
        verify(stockMovementRepository, never()).save(any(StockMovementEntity.class));
    }

    // --------------------------------------------------------------------------
    // Milestone 3: Smart Restocking and Supplier Tests
    // --------------------------------------------------------------------------

    @Test
    void testRestockRecommendationZeroStockCritical() {
        Product product = createProduct(101, "Laptop", 0, 50000.0, "Electronics");
        var rec = inventoryService.calculateRestockRecommendation(product);

        assertNotNull(rec);
        assertEquals(101, rec.getProductId());
        assertEquals("Laptop", rec.getProductName());
        assertEquals(0, rec.getCurrentQuantity());
        assertEquals(20, rec.getTargetQuantity());
        assertEquals(20, rec.getSuggestedQuantity());
        assertEquals("CRITICAL", rec.getUrgency());
        assertTrue(rec.isCandidate());
        assertTrue(rec.getReason().contains("Out of Stock"));
    }

    @Test
    void testRestockRecommendationLowStockHigh() {
        Product product = createProduct(102, "Wireless Mouse", 3, 2500.0, "Accessories");
        var rec = inventoryService.calculateRestockRecommendation(product);

        assertNotNull(rec);
        assertEquals(102, rec.getProductId());
        assertEquals(3, rec.getCurrentQuantity());
        assertEquals(20, rec.getTargetQuantity());
        assertEquals(17, rec.getSuggestedQuantity());
        assertEquals("HIGH", rec.getUrgency());
        assertTrue(rec.isCandidate());
        assertTrue(rec.getReason().contains("Low Stock"));
    }

    @Test
    void testRestockRecommendationBetweenThresholdAndTarget() {
        Product product = createProduct(103, "Monitor", 10, 18000.0, "Displays");
        var rec = inventoryService.calculateRestockRecommendation(product);

        assertNotNull(rec);
        assertEquals(10, rec.getCurrentQuantity());
        assertEquals(20, rec.getTargetQuantity());
        assertEquals(10, rec.getSuggestedQuantity());
        assertFalse(rec.isCandidate(), "Products with quantity >= low-stock threshold (5) should not be replenishment candidates");
    }

    @Test
    void testRestockRecommendationTargetMetOrExceeded() {
        Product product1 = createProduct(104, "USB-C Cable", 20, 500.0, "Cables");
        var rec1 = inventoryService.calculateRestockRecommendation(product1);
        assertNotNull(rec1);
        assertEquals(0, rec1.getSuggestedQuantity());
        assertFalse(rec1.isCandidate());

        Product product2 = createProduct(105, "HDMI Cable", 35, 800.0, "Cables");
        var rec2 = inventoryService.calculateRestockRecommendation(product2);
        assertNotNull(rec2);
        assertEquals(0, rec2.getSuggestedQuantity());
        assertFalse(rec2.isCandidate());
    }

    @Test
    void testRestockRecommendationCustomThresholdAndTarget() {
        Product product = createProduct(106, "Webcam", 7, 4500.0, "Accessories");
        // Custom: target 50, threshold 10 -> current 7 is below threshold 10
        var rec = inventoryService.calculateRestockRecommendation(product, 50, 10);

        assertNotNull(rec);
        assertEquals(7, rec.getCurrentQuantity());
        assertEquals(50, rec.getTargetQuantity());
        assertEquals(43, rec.getSuggestedQuantity());
        assertTrue(rec.isCandidate());
        assertEquals("HIGH", rec.getUrgency());
    }

    @Test
    void testGetRestockRecommendationsFiltersProperly() {
        ProductEntity p1 = createEntity(101, "Out Of Stock Item", 0, 100.0, "Test");
        ProductEntity p2 = createEntity(102, "Low Stock Item", 2, 200.0, "Test");
        ProductEntity p3 = createEntity(103, "Adequate Stock Item", 15, 300.0, "Test");
        ProductEntity p4 = createEntity(104, "Target Exceeded Item", 25, 400.0, "Test");

        when(productRepository.findAll()).thenReturn(List.of(p1, p2, p3, p4));

        var candidates = inventoryService.getRestockRecommendations();

        assertEquals(2, candidates.size());
        assertEquals(101, candidates.get(0).getProductId());
        assertEquals("CRITICAL", candidates.get(0).getUrgency());
        assertEquals(102, candidates.get(1).getProductId());
        assertEquals("HIGH", candidates.get(1).getUrgency());
    }

    @Test
    void testSimulatedRestockReceiptViaAdjustStock() {
        ProductEntity existing = createEntity(101, "Laptop", 3, 50000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));

        // User receives suggested 17 units from supplier
        var res = inventoryService.adjustStock(
                101,
                17,
                null,
                "Restock receipt from Global Tech Logistics",
                "PO-REC-101-991"
        );

        assertTrue(res.isSuccess());
        assertEquals(3, res.getPreviousQuantity());
        assertEquals(20, res.getUpdatedQuantity());
        assertEquals(101, res.getProductId());

        verify(productRepository).save(argThat(p -> p.getId() == 101 && p.getQuantity() == 20));
        verify(stockMovementRepository).save(argThat(m ->
                m.getProductId() == 101 &&
                m.getMovementType().equals("ADJUSTMENT") &&
                m.getPreviousQuantity() == 3 &&
                m.getNewQuantity() == 20 &&
                m.getQuantityChange() == 17 &&
                m.getReason().equals("Restock receipt from Global Tech Logistics") &&
                m.getReference().equals("PO-REC-101-991")
        ));
    }

    @Test
    void testCheckSupplierAvailabilitySuccess() {
        SupplierClient supplierClient = mock(SupplierClient.class);
        InventoryService serviceWithClient = new InventoryService(
                productRepository,
                stockMovementRepository,
                supplierClient,
                null,
                null
        );

        SupplierAvailabilityDto mockDto = new SupplierAvailabilityDto(
                101, "Global Tech Logistics", 150, 48000.0, true, "OK"
        );
        when(supplierClient.checkSupplierAvailability(101)).thenReturn(mockDto);

        var result = serviceWithClient.checkSupplierAvailability(101);

        assertNotNull(result);
        assertEquals("Global Tech Logistics", result.getSupplierName());
        assertEquals(150, result.getAvailableQuantity());
        assertEquals(48000.0, result.getSupplierPrice());
        assertTrue(result.isAvailable());
    }

    @Test
    void testCheckSupplierAvailabilityFallback() {
        InventoryService serviceWithoutClient = new InventoryService(
                productRepository,
                stockMovementRepository,
                null,
                null,
                null
        );

        var result = serviceWithoutClient.checkSupplierAvailability(101);

        assertNotNull(result);
        assertEquals("Supplier Service Not Configured", result.getSupplierName());
        assertFalse(result.isAvailable());
    }

    @Test
    void testGetProductExternalInfoUsesInrBaseCurrency() {
        ProductEntity existing = createEntity(101, "Laptop", 10, 55000.0, "Electronics");
        when(productRepository.findById(101)).thenReturn(Optional.of(existing));

        FrankfurterClient frankfurterClient = mock(FrankfurterClient.class);
        CurrencyInfoDto mockCurrency = new CurrencyInfoDto("INR", "USD", 0.012, 660.0, "SUCCESS");
        when(frankfurterClient.convertCurrency(55000.0, "INR", "USD")).thenReturn(mockCurrency);

        InventoryService service = new InventoryService(
                productRepository,
                stockMovementRepository,
                null,
                frankfurterClient,
                null
        );

        var info = service.getProductExternalInfo(101);

        assertNotNull(info);
        assertTrue(info.isSuccess());
        assertNotNull(info.getCurrencyInfo());
        assertEquals("INR", info.getCurrencyInfo().getBaseCurrency());
        assertEquals("USD", info.getCurrencyInfo().getTargetCurrency());

        // Verify Frankfurter was called with INR base currency, NOT EUR
        verify(frankfurterClient).convertCurrency(55000.0, "INR", "USD");
    }

    // --------------------------------------------------------------------------
    // Milestone 4: Weather-Aware Inventory Operations & Risk Advisories Tests
    // --------------------------------------------------------------------------

    @Test
    void testGetWeatherAdvisoriesSuccessMapping() {
        List<WeatherAdvisoryDto> dtoList = new ArrayList<>();
        dtoList.add(new WeatherAdvisoryDto(
                "ADV-PRECIP-HEAVY",
                "HIGH",
                "Heavy Precipitation Risk",
                "High probability of heavy rain.",
                "2026-10-23T14:00",
                "Precipitation Probability = 85%",
                "Ensure covered loading bays.",
                "Forecast-based operational advisory."
        ));

        WarehouseForecastReportDto mockReport = new WarehouseForecastReportDto(
                "Mumbai Central Distribution Hub",
                19.0760,
                72.8777,
                "2026-10-22 12:00:00",
                48,
                28.0,
                14.5,
                "Mainly Clear",
                "SUCCESS: Live forecast from Open-Meteo API",
                dtoList
        );

        when(openMeteoClient.getWarehouseForecastAndAdvisories(48, false)).thenReturn(mockReport);
        when(productRepository.findAll()).thenReturn(Collections.emptyList());

        GetWeatherAdvisoriesResponse response = inventoryService.getWeatherAdvisories(48, false);

        assertNotNull(response);
        assertEquals("Mumbai Central Distribution Hub", response.getLocation());
        assertEquals(19.0760, response.getLatitude(), 0.001);
        assertEquals(72.8777, response.getLongitude(), 0.001);
        assertEquals("2026-10-22 12:00:00", response.getRetrievalTime());
        assertEquals(48, response.getForecastHorizonHours());
        assertTrue(response.getStatus().contains("SUCCESS"));

        assertNotNull(response.getCurrentWeather());
        assertEquals(28.0, response.getCurrentWeather().getTemperature());
        assertEquals(14.5, response.getCurrentWeather().getWindSpeed());
        assertEquals("Mainly Clear", response.getCurrentWeather().getWeatherCondition());

        assertEquals(1, response.getAdvisories().size());
        WeatherAdvisory adv = response.getAdvisories().get(0);
        assertEquals("ADV-PRECIP-HEAVY", adv.getId());
        assertEquals("HIGH", adv.getSeverity());
        assertEquals("Heavy Precipitation Risk", adv.getTitle());
        assertEquals("Ensure covered loading bays.", adv.getRecommendedAction());
    }

    @Test
    void testGetWeatherAdvisoriesWithNullClientFallback() {
        InventoryService serviceWithoutWeather = new InventoryService(
                productRepository,
                stockMovementRepository,
                null,
                null,
                null
        );

        GetWeatherAdvisoriesResponse response = serviceWithoutWeather.getWeatherAdvisories(24, false);

        assertNotNull(response);
        assertEquals("Warehouse Hub", response.getLocation());
        assertTrue(response.getStatus().contains("UNAVAILABLE"));
        assertEquals(1, response.getAdvisories().size());
        assertEquals("ADV-METEO-UNCONF", response.getAdvisories().get(0).getId());
    }

    @Test
    void testAdverseWeatherCorrelatedWithOutOfStockProducts() {
        List<WeatherAdvisoryDto> dtoList = new ArrayList<>();
        dtoList.add(new WeatherAdvisoryDto(
                "ADV-WIND-HIGH",
                "WARNING",
                "High Wind Hazard",
                "High wind speeds at bays.",
                "2026-10-23T10:00",
                "Wind = 40.0 km/h",
                "Secure external yard tarpaulins.",
                "Forecast-based indication."
        ));

        WarehouseForecastReportDto mockReport = new WarehouseForecastReportDto(
                "Mumbai Central Distribution Hub",
                19.0760,
                72.8777,
                "2026-10-22 12:00:00",
                48,
                29.0,
                40.0,
                "Windy",
                "SUCCESS",
                dtoList
        );

        when(openMeteoClient.getWarehouseForecastAndAdvisories(48, false)).thenReturn(mockReport);

        // Product 101 has 0 stock (out of stock)
        ProductEntity outOfStockProduct = createEntity(101, "Mechanical Keyboard", 0, 3500.0, "Peripherals");
        when(productRepository.findAll()).thenReturn(List.of(outOfStockProduct));

        GetWeatherAdvisoriesResponse response = inventoryService.getWeatherAdvisories(48, false);

        assertNotNull(response);
        // Original weather advisory + generated product out-of-stock risk advisory
        assertEquals(2, response.getAdvisories().size());

        Optional<WeatherAdvisory> stockoutAdv = response.getAdvisories().stream()
                .filter(a -> "ADV-INV-OUT-OF-STOCK".equals(a.getId()))
                .findFirst();

        assertTrue(stockoutAdv.isPresent());
        assertEquals("HIGH", stockoutAdv.get().getSeverity());
        assertTrue(stockoutAdv.get().getTitle().contains("Stockout"));
        assertTrue(stockoutAdv.get().getDescription().contains("Mechanical Keyboard"));
        assertTrue(stockoutAdv.get().getRecommendedAction().contains("Prioritize supplier dispatch confirmation"));
    }

    @Test
    void testAdverseWeatherCorrelatedWithLowStockReplenishmentProducts() {
        List<WeatherAdvisoryDto> dtoList = new ArrayList<>();
        dtoList.add(new WeatherAdvisoryDto(
                "ADV-WIND-HIGH",
                "WARNING",
                "High Wind Hazard",
                "High wind speeds at bays.",
                "2026-10-23T10:00",
                "Wind = 38.0 km/h",
                "Secure external yard tarpaulins.",
                "Forecast-based indication."
        ));

        WarehouseForecastReportDto mockReport = new WarehouseForecastReportDto(
                "Mumbai Central Distribution Hub",
                19.0760,
                72.8777,
                "2026-10-22 12:00:00",
                48,
                29.0,
                38.0,
                "Windy",
                "SUCCESS",
                dtoList
        );

        when(openMeteoClient.getWarehouseForecastAndAdvisories(48, false)).thenReturn(mockReport);

        // Product 102 has 3 stock (low stock, but not 0)
        ProductEntity lowStockProduct = createEntity(102, "USB-C Hub", 3, 1200.0, "Accessories");
        when(productRepository.findAll()).thenReturn(List.of(lowStockProduct));

        GetWeatherAdvisoriesResponse response = inventoryService.getWeatherAdvisories(48, false);

        assertNotNull(response);
        assertEquals(2, response.getAdvisories().size());

        Optional<WeatherAdvisory> restockAdv = response.getAdvisories().stream()
                .filter(a -> "ADV-INV-REPLENISH-TIMING".equals(a.getId()))
                .findFirst();

        assertTrue(restockAdv.isPresent());
        assertEquals("WARNING", restockAdv.get().getSeverity());
        assertTrue(restockAdv.get().getTitle().contains("Replenishment Timing"));
        assertTrue(restockAdv.get().getRecommendedAction().contains("Review supplier lead times"));
    }

    @Test
    void testNormalWeatherDoesNotAddStockoutAdvisory() {
        List<WeatherAdvisoryDto> dtoList = new ArrayList<>();
        dtoList.add(new WeatherAdvisoryDto(
                "ADV-NORMAL-COND",
                "INFO",
                "Normal Operating Conditions",
                "Standard conditions.",
                "Next 48 Hours",
                "All metrics normal.",
                "Standard warehousing schedules apply.",
                "Forecast-based indication."
        ));

        WarehouseForecastReportDto mockReport = new WarehouseForecastReportDto(
                "Mumbai Central Distribution Hub",
                19.0760,
                72.8777,
                "2026-10-22 12:00:00",
                48,
                27.0,
                10.0,
                "Clear",
                "SUCCESS",
                dtoList
        );

        when(openMeteoClient.getWarehouseForecastAndAdvisories(48, false)).thenReturn(mockReport);

        // Even with out-of-stock product, no weather stockout risk is generated when weather is normal
        ProductEntity outOfStockProduct = createEntity(101, "Mechanical Keyboard", 0, 3500.0, "Peripherals");
        when(productRepository.findAll()).thenReturn(List.of(outOfStockProduct));

        GetWeatherAdvisoriesResponse response = inventoryService.getWeatherAdvisories(48, false);

        assertNotNull(response);
        assertEquals(1, response.getAdvisories().size());
        assertEquals("ADV-NORMAL-COND", response.getAdvisories().get(0).getId());
    }

    @Test
    void testWeatherUnavailableDoesNotBreakInventoryOperations() {
        when(openMeteoClient.getWarehouseWeather()).thenThrow(new RuntimeException("Meteo timeout"));

        // Product add, get, update, delete still function perfectly
        Product product = createProduct(105, "Wireless Mouse", 15, 1200.0, "Peripherals");
        when(productRepository.existsById(105)).thenReturn(false);

        boolean added = inventoryService.addProduct(product);
        assertTrue(added);

        ProductEntity entity = createEntity(105, "Wireless Mouse", 15, 1200.0, "Peripherals");
        when(productRepository.findById(105)).thenReturn(Optional.of(entity));

        Optional<Product> found = inventoryService.getProduct(105);
        assertTrue(found.isPresent());
        assertEquals("Wireless Mouse", found.get().getName());
    }
}
