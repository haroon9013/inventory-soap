package com.example.inventory.service;

import com.example.inventory.entity.ProductEntity;
import com.example.inventory.entity.StockMovementEntity;
import com.example.inventory.generated.AdjustStockResponse;
import com.example.inventory.generated.Product;
import com.example.inventory.repository.ProductRepository;
import com.example.inventory.repository.StockMovementRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("local")
public class InventoryTransactionIntegrationTest {

    @Autowired
    private InventoryService inventoryService;

    @Autowired
    private ProductRepository productRepository;

    @Autowired
    private StockMovementRepository stockMovementRepository;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @BeforeEach
    void setUp() {
        stockMovementRepository.deleteAll();
        productRepository.deleteAll();
    }

    @Test
    void testAtomicAddProductAndMovement() {
        Product product = new Product();
        product.setId(501);
        product.setName("Atomic Item");
        product.setQuantity(20);
        product.setPrice(1200.0);
        product.setCategory("Hardware");

        boolean added = inventoryService.addProduct(product);
        assertTrue(added);

        Optional<ProductEntity> saved = productRepository.findById(501);
        assertTrue(saved.isPresent());
        assertEquals(20, saved.get().getQuantity());

        List<StockMovementEntity> movements = stockMovementRepository.findByProductIdOrderByTimestampDescIdDesc(501);
        assertEquals(1, movements.size());
        assertEquals("STOCK_IN", movements.get(0).getMovementType());
        assertEquals(20, movements.get(0).getQuantityChange());
    }

    @Test
    void testAtomicAdjustStockUpdatesEntityAndMovement() {
        productRepository.save(new ProductEntity(502, "Adjustable Item", 15, 500.0, "Office"));

        AdjustStockResponse response = inventoryService.adjustStock(502, -5, null, "Cycle count", "REF-001");
        assertTrue(response.isSuccess());
        assertEquals(10, response.getUpdatedQuantity());

        ProductEntity updated = productRepository.findById(502).orElseThrow();
        assertEquals(10, updated.getQuantity());

        List<StockMovementEntity> movements = stockMovementRepository.findByProductIdOrderByTimestampDescIdDesc(502);
        assertEquals(1, movements.size());
        assertEquals(-5, movements.get(0).getQuantityChange());
        assertEquals(10, movements.get(0).getNewQuantity());
    }

    @Test
    void testAtomicDeletionAndMovementRecord() {
        productRepository.save(new ProductEntity(503, "Discontinued Item", 8, 300.0, "Misc"));

        boolean deleted = inventoryService.deleteProduct(503);
        assertTrue(deleted);

        // Product is deleted from products table
        assertFalse(productRepository.existsById(503));

        // Movement record is preserved in stock_movements
        List<StockMovementEntity> movements = stockMovementRepository.findByProductIdOrderByTimestampDescIdDesc(503);
        assertEquals(1, movements.size());
        assertEquals("STOCK_OUT", movements.get(0).getMovementType());
        assertEquals(8, movements.get(0).getPreviousQuantity());
        assertEquals(0, movements.get(0).getNewQuantity());
        assertEquals(-8, movements.get(0).getQuantityChange());
        assertEquals("DELETE_PRODUCT", movements.get(0).getReference());
    }

    @Test
    void testRollbackWhenTransactionFails() {
        productRepository.save(new ProductEntity(504, "Rollback Item", 30, 100.0, "Test"));

        // Execute an operation within a transaction template that simulates an unhandled failure
        TransactionTemplate txTemplate = new TransactionTemplate(transactionManager);
        txTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);

        try {
            txTemplate.execute(status -> {
                ProductEntity entity = productRepository.findById(504).orElseThrow();
                entity.setQuantity(50);
                productRepository.save(entity);

                stockMovementRepository.save(new StockMovementEntity(
                        504, "Rollback Item", "STOCK_IN", 30, 50, 20, "Batch", java.time.LocalDateTime.now(), "TX-FAIL"
                ));
                // Simulate an unexpected downstream failure triggering rollback
                throw new RuntimeException("Simulated unexpected failure during stock movement processing");
            });
        } catch (RuntimeException e) {
            assertTrue(e.getMessage() != null && e.getMessage().contains("Simulated unexpected failure"));
        }

        // Verify that the rollback occurred: product quantity remains 30, no movement was recorded
        ProductEntity entityAfter = productRepository.findById(504).orElseThrow();
        assertEquals(30, entityAfter.getQuantity());
        List<StockMovementEntity> movements = stockMovementRepository.findByProductIdOrderByTimestampDescIdDesc(504);
        assertTrue(movements.isEmpty());
    }

    @Test
    void testConcurrentUpdatesPreventLostStock() throws InterruptedException {
        productRepository.save(new ProductEntity(505, "Concurrent Item", 100, 250.0, "Electronics"));

        int threadCount = 4;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);

        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger conflictCount = new AtomicInteger(0);

        for (int i = 0; i < threadCount; i++) {
            final int delta = -10;
            executor.submit(() -> {
                try {
                    startLatch.await();
                    AdjustStockResponse resp = inventoryService.adjustStock(505, delta, null, "Concurrent test", "CONC");
                    if (resp.isSuccess()) {
                        successCount.incrementAndGet();
                    } else if (resp.getMessage().contains("Concurrency conflict")) {
                        conflictCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    // unexpected
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        boolean completed = doneLatch.await(5, TimeUnit.SECONDS);
        executor.shutdown();
        assertTrue(completed);

        ProductEntity finalEntity = productRepository.findById(505).orElseThrow();
        int expectedEndingQty = 100 - (successCount.get() * 10);
        assertEquals(expectedEndingQty, finalEntity.getQuantity(),
                "Stock quantity must precisely reflect successful adjustments without lost updates");

        List<StockMovementEntity> movements = stockMovementRepository.findByProductIdOrderByTimestampDescIdDesc(505);
        assertEquals(successCount.get(), movements.size(),
                "Number of movement records must precisely match number of successful adjustments");
    }

    @Test
    void testProductDeletionPreservesHistoryAndPreventsIdReuseMixingHistories() {
        Product productV1 = new Product();
        productV1.setId(506);
        productV1.setName("Widget Original");
        productV1.setQuantity(50);
        productV1.setPrice(100.0);
        productV1.setCategory("Widgets");

        boolean added = inventoryService.addProduct(productV1);
        assertTrue(added);

        // Adjust stock
        AdjustStockResponse adjResponse = inventoryService.adjustStock(506, -10, null, "Sold items", "ORDER-1");
        assertTrue(adjResponse.isSuccess());

        // Delete the product
        boolean deleted = inventoryService.deleteProduct(506);
        assertTrue(deleted);

        // Verify entity is gone from products
        assertFalse(productRepository.existsById(506));

        // Verify history is preserved (ADD, ADJUST, DELETE)
        List<StockMovementEntity> history = stockMovementRepository.findByProductIdOrderByTimestampDescIdDesc(506);
        assertEquals(3, history.size(), "All 3 historical movements must be preserved after product deletion");

        // Attempt to create a completely new product reusing the same ID 506
        Product productV2 = new Product();
        productV2.setId(506);
        productV2.setName("Brand New Unrelated Gadget");
        productV2.setQuantity(200);
        productV2.setPrice(999.0);
        productV2.setCategory("Gadgets");

        boolean reusedAddResult = inventoryService.addProduct(productV2);
        assertFalse(reusedAddResult, "Adding a product with an ID that has existing movement history must be rejected");

        // Verify database state: product remains deleted, history remains uncontaminated
        assertFalse(productRepository.existsById(506));
        List<StockMovementEntity> historyAfter = stockMovementRepository.findByProductIdOrderByTimestampDescIdDesc(506);
        assertEquals(3, historyAfter.size(), "Movement history must remain intact and not contaminated");
        assertEquals("DELETE_PRODUCT", historyAfter.get(0).getReference());
    }
}
