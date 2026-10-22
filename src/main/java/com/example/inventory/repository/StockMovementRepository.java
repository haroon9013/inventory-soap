package com.example.inventory.repository;

import com.example.inventory.entity.StockMovementEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StockMovementRepository extends JpaRepository<StockMovementEntity, Long> {

    List<StockMovementEntity> findAllByOrderByTimestampDescIdDesc();

    List<StockMovementEntity> findAllByOrderByTimestampDescIdDesc(Pageable pageable);

    List<StockMovementEntity> findByProductIdOrderByTimestampDescIdDesc(int productId);

    List<StockMovementEntity> findByProductIdOrderByTimestampDescIdDesc(int productId, Pageable pageable);
}
