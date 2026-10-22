package com.example.inventory.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;
import java.net.URI;

@Configuration
public class DataSourceConfig {

    private static final Logger log = LoggerFactory.getLogger(DataSourceConfig.class);

    @Value("${DATABASE_URL:#{null}}")
    private String databaseUrl;

    @Value("${spring.datasource.url}")
    private String springDatasourceUrl;

    @Value("${spring.datasource.username:#{null}}")
    private String username;

    @Value("${spring.datasource.password:#{null}}")
    private String password;

    @Value("${spring.datasource.driver-class-name:org.postgresql.Driver}")
    private String driverClassName;

    @Bean
    @Primary
    public DataSource dataSource() {
        HikariConfig config = new HikariConfig();
        config.setDriverClassName(driverClassName);

        // 1. Check if Render / Cloud DATABASE_URL is provided (e.g., postgres://user:pass@host:port/dbname)
        if (databaseUrl != null && !databaseUrl.isBlank()) {
            log.info("Detected DATABASE_URL environment variable - configuring DataSource for cloud deployment");
            try {
                if (databaseUrl.startsWith("jdbc:")) {
                    config.setJdbcUrl(databaseUrl);
                    if (username != null && !username.isBlank()) config.setUsername(username);
                    if (password != null && !password.isBlank()) config.setPassword(password);
                } else {
                    URI dbUri = new URI(databaseUrl);
                    String userInfo = dbUri.getUserInfo();
                    if (userInfo != null) {
                        String[] parts = userInfo.split(":", 2);
                        config.setUsername(parts[0]);
                        if (parts.length > 1) {
                            config.setPassword(parts[1]);
                        }
                    } else {
                        if (username != null && !username.isBlank()) config.setUsername(username);
                        if (password != null && !password.isBlank()) config.setPassword(password);
                    }

                    int port = dbUri.getPort() != -1 ? dbUri.getPort() : 5432;
                    String host = dbUri.getHost();
                    String path = dbUri.getPath();
                    String query = dbUri.getQuery();

                    String jdbcUrl = "jdbc:postgresql://" + host + ":" + port + path;
                    if (query != null && !query.isBlank()) {
                        jdbcUrl += "?" + query;
                    } else {
                        jdbcUrl += "?sslmode=prefer";
                    }
                    config.setJdbcUrl(jdbcUrl);
                }
                return new HikariDataSource(config);
            } catch (Exception e) {
                log.warn("Could not parse DATABASE_URL as URI, falling back to spring.datasource.url: {}", e.getMessage());
            }
        }

        // 2. Standard configuration using spring.datasource.url, username, and password
        log.info("Configuring DataSource using spring.datasource properties");
        config.setJdbcUrl(springDatasourceUrl);
        if (username != null && !username.isBlank()) {
            config.setUsername(username);
        }
        if (password != null && !password.isBlank()) {
            config.setPassword(password);
        }
        return new HikariDataSource(config);
    }

    @Bean
    public org.springframework.boot.ApplicationRunner databaseVersionSanitizer(DataSource dataSource) {
        return args -> {
            try (java.sql.Connection conn = dataSource.getConnection();
                 java.sql.Statement stmt = conn.createStatement()) {
                int updated = stmt.executeUpdate("UPDATE products SET version = 0 WHERE version IS NULL");
                if (updated > 0) {
                    log.info("Sanitized {} legacy product records with null version -> 0", updated);
                }
            } catch (Exception e) {
                log.debug("Database version initialization skipped: {}", e.getMessage());
            }
        };
    }
}
