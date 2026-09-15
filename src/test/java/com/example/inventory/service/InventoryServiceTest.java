package com.example.inventory.service;

import com.example.inventory.client.FrankfurterClient;
import com.example.inventory.client.OpenMeteoClient;
import com.example.inventory.client.SupplierClient;
import com.example.inventory.dto.CurrencyInfoDto;
import com.example.inventory.dto.ProductExternalInfoDto;
import com.example.inventory.dto.SupplierAvailabilityDto;
import com.example.inventory.dto.WeatherInfoDto;
import com.example.inventory.entity.ProductEntity;
import com.example.inventory.generated.Product;
import com.example.inventory.repository.ProductRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.*;

class InventoryServiceTest {

    private ProductRepository productRepository;
    private SupplierClient supplierClient;
    private FrankfurterClient frankfurterClient;
    private OpenMeteoClient openMeteoClient;
    private InventoryService inventoryService;

    @BeforeEach
    void setUp() {
        productRepository = mock(ProductRepository.class);
        supplierClient = mock(SupplierClient.class);
        frankfurterClient = mock(FrankfurterClient.class);
        openMeteoClient = mock(OpenMeteoClient.class);
        inventoryService = new InventoryService(productRepository, supplierClient, frankfurterClient, openMeteoClient);
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
}
