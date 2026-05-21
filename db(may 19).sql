-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: datachart
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned DEFAULT NULL,
  `action` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `detail` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=65 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_log`
--

LOCK TABLES `audit_log` WRITE;
/*!40000 ALTER TABLE `audit_log` DISABLE KEYS */;
INSERT INTO `audit_log` VALUES (1,1,'login','','2026-05-15 13:55:13'),(2,1,'logout','','2026-05-15 13:56:15'),(3,2,'login','','2026-05-15 13:56:53'),(4,2,'file_upload','flood_control.csv','2026-05-15 13:58:10'),(5,2,'file_activate','id=1','2026-05-15 13:58:12'),(6,2,'logout','','2026-05-15 14:00:19'),(7,3,'login','','2026-05-15 14:00:53'),(8,3,'logout','','2026-05-15 14:07:09'),(9,2,'login','','2026-05-15 14:07:21'),(10,2,'file_upload','flood_control_sample.csv','2026-05-15 14:52:08'),(11,2,'file_activate','id=2','2026-05-15 14:52:13'),(12,2,'file_activate','id=1','2026-05-15 14:52:28'),(13,2,'login','','2026-05-16 21:38:18'),(14,2,'file_activate','id=2','2026-05-16 21:45:08'),(15,2,'file_activate','id=1','2026-05-16 21:48:02'),(16,2,'logout','','2026-05-17 00:25:13'),(17,2,'login','','2026-05-17 00:25:21'),(18,3,'login','','2026-05-17 00:26:10'),(19,2,'login','','2026-05-19 08:37:42'),(20,2,'login','','2026-05-19 09:49:00'),(21,2,'file_activate','id=2','2026-05-19 13:02:40'),(22,2,'file_activate','id=1','2026-05-19 13:02:55'),(23,2,'file_upload','leave_records.csv','2026-05-19 13:11:24'),(24,2,'file_activate','id=3','2026-05-19 13:11:28'),(25,2,'file_activate','id=1','2026-05-19 13:11:52'),(26,2,'file_delete','leave_records.csv','2026-05-19 13:12:01'),(27,2,'file_deactivate_all','','2026-05-19 13:13:57'),(28,2,'file_activate','id=1','2026-05-19 13:14:08'),(29,2,'file_upload','leave_records.csv','2026-05-19 13:16:46'),(30,2,'file_upload','leave_records.csv','2026-05-19 13:19:40'),(31,2,'file_upload','leave_records.csv','2026-05-19 13:19:52'),(32,2,'file_delete','leave_records.csv','2026-05-19 13:22:36'),(33,2,'file_delete','leave_records.csv','2026-05-19 13:22:43'),(34,2,'file_delete','leave_records.csv','2026-05-19 13:22:48'),(35,2,'logout','','2026-05-19 13:25:51'),(36,3,'login','','2026-05-19 13:29:39'),(37,3,'logout','','2026-05-19 13:30:48'),(38,2,'login','','2026-05-19 13:31:03'),(39,2,'logout','','2026-05-19 13:32:49'),(40,2,'login','','2026-05-19 13:33:11'),(41,2,'logout','','2026-05-19 13:36:44'),(42,1,'login','','2026-05-19 13:37:12'),(43,1,'logout','','2026-05-19 13:38:29'),(44,2,'login','','2026-05-19 13:39:18'),(45,2,'logout','','2026-05-19 13:51:37'),(46,1,'login','','2026-05-19 13:51:51'),(47,1,'admin_set_role','id=2 role=1','2026-05-19 13:52:03'),(48,1,'admin_set_role','id=2 role=2','2026-05-19 13:52:07'),(49,1,'admin_set_role','id=2 role=1','2026-05-19 13:52:16'),(50,1,'logout','','2026-05-19 13:52:18'),(51,2,'login','','2026-05-19 13:52:28'),(52,2,'logout','','2026-05-19 13:52:34'),(53,1,'login','','2026-05-19 13:52:43'),(54,1,'admin_set_role','id=2 role=2','2026-05-19 13:52:49'),(55,1,'logout','','2026-05-19 13:53:46'),(56,1,'login','','2026-05-19 13:54:31'),(57,1,'logout','','2026-05-19 13:56:03'),(58,2,'login','','2026-05-19 13:56:25'),(59,2,'logout','','2026-05-19 13:57:33'),(60,3,'login','','2026-05-19 13:57:44'),(61,3,'logout','','2026-05-19 13:58:22'),(62,2,'login','','2026-05-19 14:11:17'),(63,2,'file_activate','id=2','2026-05-19 14:11:45'),(64,2,'file_activate','id=1','2026-05-19 14:11:55');
/*!40000 ALTER TABLE `audit_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` tinyint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'admin'),(3,'boss'),(2,'staff');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `uploaded_files`
--

DROP TABLE IF EXISTS `uploaded_files`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `uploaded_files` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `uploaded_by` int unsigned NOT NULL,
  `original_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `stored_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` int unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '0',
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stored_name` (`stored_name`),
  KEY `uploaded_by` (`uploaded_by`),
  CONSTRAINT `uploaded_files_ibfk_1` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `uploaded_files`
--

LOCK TABLES `uploaded_files` WRITE;
/*!40000 ALTER TABLE `uploaded_files` DISABLE KEYS */;
INSERT INTO `uploaded_files` VALUES (1,2,'flood_control.csv','dc_6a06b5f2ac5e12.69771939.csv',4631465,1,'2026-05-15 13:58:10'),(2,2,'flood_control_sample.csv','dc_6a06c298ef6bc0.98298900.csv',12897,0,'2026-05-15 14:52:08');
/*!40000 ALTER TABLE `uploaded_files` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `first_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `middle_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `last_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `role_id` tinyint unsigned NOT NULL DEFAULT '3',
  `status` enum('pending','active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  KEY `role_id` (`role_id`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','admin@datachart.local','$2y$12$Q/LSN8loVrJd13DXtgTPleFCvj01N23bNWnpXIlYjhhWO3bOllaZC','System Admin','System','','Admin',1,'active','2026-05-15 13:38:06'),(2,'staff1','staff@datachart.local','$2y$12$Q/LSN8loVrJd13DXtgTPleFCvj01N23bNWnpXIlYjhhWO3bOllaZC','Staff','Staff','','Staff',2,'active','2026-05-15 13:38:06'),(3,'boss1','boss@datachart.local','$2y$12$Q/LSN8loVrJd13DXtgTPleFCvj01N23bNWnpXIlYjhhWO3bOllaZC','Boss','Boss','','',3,'active','2026-05-15 13:38:06');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'datachart'
--

--
-- Dumping routines for database 'datachart'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-19 14:33:54
