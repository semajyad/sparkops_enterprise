"""
Security test suite for SparkOps Enterprise authentication and authorization.
Tests cover authentication flows, token security, role-based access control, and session management.
"""

import pytest
import asyncio
import time
from unittest.mock import Mock, patch, AsyncMock
from fastapi.testclient import TestClient
from fastapi import status
import jwt
from datetime import datetime, timedelta

# Mock imports for testing
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from services.auth import AuthService, verify_token

class TestAuthenticationSecurity:
    """Test suite for authentication security vulnerabilities."""
    
    def setup_method(self):
        """Set up test client and mocks."""
        self.client = TestClient(app)
        self.auth_service = AuthService()
        
    def test_login_sql_injection_attempts(self):
        """Test SQL injection protection in login endpoint."""
        malicious_inputs = [
            "' OR '1'='1",
            "admin'--",
            "' UNION SELECT * FROM users --",
            "'; DROP TABLE users; --",
            "' OR 1=1 #",
            "admin'/**/OR/**/1=1--"
        ]
        
        for payload in malicious_inputs:
            response = self.client.post(
                "/api/v1/auth/login",
                json={"email": payload, "password": "test"}
            )
            # Should not return 200 (successful login) or 500 (SQL error)
            assert response.status_code not in [status.HTTP_200_OK, status.HTTP_500_INTERNAL_SERVER_ERROR]
    
    def test_password_strength_validation(self):
        """Test password strength requirements."""
        weak_passwords = [
            "123",           # Too short
            "password",      # Common password
            "qwerty",        # Common pattern
            "11111111",      # Repeated characters
            "abc123",        # Too simple
        ]
        
        for weak_pwd in weak_passwords:
            response = self.client.post(
                "/api/v1/auth/register",
                json={
                    "email": "test@example.com",
                    "password": weak_pwd,
                    "full_name": "Test User"
                }
            )
            # Should reject weak passwords
            assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_brute_force_protection(self):
        """Test brute force attack protection."""
        # Attempt multiple failed logins
        for i in range(10):
            response = self.client.post(
                "/api/v1/auth/login",
                json={"email": "test@example.com", "password": f"wrong_{i}"}
            )
        
        # Should be rate limited after multiple attempts
        response = self.client.post(
            "/api/v1/auth/login",
            json={"email": "test@example.com", "password": "wrong_final"}
        )
        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    
    def test_token_expiration_security(self):
        """Test JWT token expiration handling."""
        # Create expired token
        expired_payload = {
            "sub": "test_user",
            "exp": datetime.utcnow() - timedelta(hours=1)
        }
        expired_token = jwt.encode(expired_payload, "test_secret", algorithm="HS256")
        
        # Try to use expired token
        response = self.client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {expired_token}"}
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_token_tampering_protection(self):
        """Test JWT token tampering detection."""
        # Create valid token
        valid_payload = {"sub": "test_user", "exp": datetime.utcnow() + timedelta(hours=1)}
        valid_token = jwt.encode(valid_payload, "test_secret", algorithm="HS256")
        
        # Tamper with token
        tampered_token = valid_token[:-10] + "tampered"
        
        # Try to use tampered token
        response = self.client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {tampered_token}"}
        )
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    @patch('services.auth.supabase')
    def test_session_hijacking_protection(self, mock_supabase):
        """Test session hijacking protection mechanisms."""
        # Mock successful login
        mock_supabase.auth.sign_in_with_password.return_value = Mock(
            data={"session": {"access_token": "test_token", "user": {"id": "test_user"}}},
            error=None
        )
        
        # Login and get session
        response = self.client.post(
            "/api/v1/auth/login",
            json={"email": "test@example.com", "password": "valid_password"}
        )
        
        # Verify session contains security attributes
        if response.status_code == 200:
            session_data = response.json()
            assert "session" in session_data
            # Should include IP binding or other security measures
            # This would depend on actual implementation
    
    def test_csrf_protection(self):
        """Test CSRF protection mechanisms."""
        # Test that state-changing endpoints require proper CSRF tokens
        response = self.client.post(
            "/api/v1/auth/logout",
            headers={"Origin": "evil-site.com"}
        )
        # Should reject cross-origin requests without CSRF token
        assert response.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_400_BAD_REQUEST]


class TestAuthorizationSecurity:
    """Test suite for authorization and role-based access control."""
    
    def setup_method(self):
        """Set up test client and role mocks."""
        self.client = TestClient(app)
        
        # Mock different user roles
        self.owner_token = self._create_mock_token("user123", {"role": "OWNER"})
        self.employee_token = self._create_mock_token("user456", {"role": "EMPLOYEE"})
        self.invalid_token = "invalid.token.format"
    
    def _create_mock_token(self, user_id: str, claims: dict) -> str:
        """Helper to create mock JWT tokens for testing."""
        payload = {
            "sub": user_id,
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + timedelta(hours=1),
            **claims
        }
        return jwt.encode(payload, "test_secret", algorithm="HS256")
    
    def test_role_based_access_control(self):
        """Test that roles properly restrict access to endpoints."""
        # Test owner-only endpoint
        owner_response = self.client.get(
            "/api/v1/admin/settings",
            headers={"Authorization": f"Bearer {self.owner_token}"}
        )
        employee_response = self.client.get(
            "/api/v1/admin/settings",
            headers={"Authorization": f"Bearer {self.employee_token}"}
        )
        
        # Owner should have access, employee should not
        assert owner_response.status_code != status.HTTP_403_FORBIDDEN
        assert employee_response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_privilege_escalation_prevention(self):
        """Test prevention of privilege escalation attacks."""
        # Try to access admin resources with employee token
        admin_endpoints = [
            "/api/v1/admin/users",
            "/api/v1/admin/settings",
            "/api/v1/admin/audit-logs"
        ]
        
        for endpoint in admin_endpoints:
            response = self.client.get(
                endpoint,
                headers={"Authorization": f"Bearer {self.employee_token}"}
            )
            assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_cross_tenant_data_access(self):
        """Test prevention of cross-tenant data access."""
        # Mock employee from one organization trying to access another's data
        malicious_headers = {
            "Authorization": f"Bearer {self.employee_token}",
            "X-Organization-ID": "other-org-id"  # Try to access different org
        }
        
        response = self.client.get(
            "/api/v1/jobs",
            headers=malicious_headers
        )
        
        # Should not allow cross-organization access
        if response.status_code == 200:
            jobs = response.json()
            # Should only return jobs from user's own organization
            for job in jobs.get("jobs", []):
                assert job.get("organization_id") != "other-org-id"
    
    def test_inactive_user_access_denial(self):
        """Test that inactive users cannot access the system."""
        # Create token for inactive user
        inactive_token = self._create_mock_token("inactive_user", {"active": False})
        
        response = self.client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {inactive_token}"}
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestInputValidationSecurity:
    """Test suite for input validation and injection prevention."""
    
    def setup_method(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    def test_xss_prevention(self):
        """Test XSS prevention in input fields."""
        xss_payloads = [
            "<script>alert('xss')</script>",
            "javascript:alert('xss')",
            "<img src=x onerror=alert('xss')>",
            "'\"><script>alert('xss')</script>",
            "<svg onload=alert('xss')>"
        ]
        
        for payload in xss_payloads:
            # Test in job creation
            response = self.client.post(
                "/api/v1/jobs",
                json={
                    "title": payload,
                    "description": payload,
                    "client_name": payload
                },
                headers={"Authorization": "Bearer valid_token"}
            )
            
            # If request succeeds, ensure XSS is sanitized in response
            if response.status_code == 200:
                response_text = str(response.json())
                assert "<script>" not in response_text
                assert "javascript:" not in response_text
    
    def test_path_traversal_prevention(self):
        """Test path traversal attack prevention."""
        malicious_paths = [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32\\config\\sam",
            "/etc/passwd",
            "C:\\Windows\\System32\\drivers\\etc\\hosts"
        ]
        
        for path in malicious_paths:
            response = self.client.get(
                f"/api/v1/files?path={path}",
                headers={"Authorization": "Bearer valid_token"}
            )
            
            # Should prevent path traversal
            assert response.status_code in [
                status.HTTP_400_BAD_REQUEST,
                status.HTTP_403_FORBIDDEN,
                status.HTTP_404_NOT_FOUND
            ]
    
    def test_command_injection_prevention(self):
        """Test command injection prevention."""
        command_injection_payloads = [
            "test; ls -la",
            "test && cat /etc/passwd",
            "test | whoami",
            "test; rm -rf /",
            "test`whoami`",
            "test$(whoami)"
        ]
        
        for payload in command_injection_payloads:
            # Test in any endpoint that might process commands
            response = self.client.post(
                "/api/v1/ingest/process",
                data={"audio_url": payload},
                headers={"Authorization": "Bearer valid_token"}
            )
            
            # Should prevent command injection
            assert response.status_code != status.HTTP_500_INTERNAL_SERVER_ERROR


class TestDataProtectionSecurity:
    """Test suite for data protection and privacy."""
    
    def setup_method(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    def test_sensitive_data_exposure(self):
        """Test prevention of sensitive data exposure."""
        # Test user endpoint doesn't expose sensitive fields
        response = self.client.get(
            "/api/v1/users/me",
            headers={"Authorization": "Bearer valid_token"}
        )
        
        if response.status_code == 200:
            user_data = response.json()
            sensitive_fields = ["password", "password_hash", "secret", "token"]
            
            for field in sensitive_fields:
                assert field not in user_data
    
    def test_data_encryption_in_transit(self):
        """Test that sensitive data is encrypted in transit."""
        # Test HTTPS enforcement
        response = self.client.get(
            "/api/v1/users/me",
            headers={"Authorization": "Bearer valid_token"},
            follow_redirects=False
        )
        
        # Should redirect to HTTPS or enforce secure connection
        # This would depend on deployment configuration
    
    def test_pii_data_handling(self):
        """Test proper handling of PII (Personally Identifiable Information)."""
        # Create job with PII
        pii_data = {
            "client_name": "John Doe",
            "client_phone": "+1234567890",
            "client_email": "john.doe@example.com",
            "address": "123 Main St, Anytown, USA"
        }
        
        response = self.client.post(
            "/api/v1/jobs",
            json=pii_data,
            headers={"Authorization": "Bearer valid_token"}
        )
        
        if response.status_code == 200:
            # Verify PII is properly masked or protected in logs/response
            job_data = response.json()
            # Phone numbers and emails should be partially masked
            if "client_phone" in job_data:
                phone = job_data["client_phone"]
                assert len(phone) >= 4 and phone[-4:].isdigit()
    
    def test_data_retention_policy(self):
        """Test data retention and deletion policies."""
        # Test that old data is properly handled
        # This would depend on actual data retention implementation
        pass


class TestAPISecurity:
    """Test suite for API-level security."""
    
    def setup_method(self):
        """Set up test client."""
        self.client = TestClient(app)
    
    def test_rate_limiting(self):
        """Test API rate limiting."""
        # Make rapid requests
        responses = []
        for i in range(100):
            response = self.client.get("/api/v1/health")
            responses.append(response)
            if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
                break
        
        # Should eventually hit rate limit
        rate_limited = any(r.status_code == status.HTTP_429_TOO_MANY_REQUESTS for r in responses)
        assert rate_limited, "Rate limiting not working"
    
    def test_cors_configuration(self):
        """Test CORS configuration."""
        # Test preflight request
        response = self.client.options(
            "/api/v1/users/me",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "Authorization"
            }
        )
        
        # Should handle CORS properly
        assert "Access-Control-Allow-Origin" in response.headers
        assert "Access-Control-Allow-Methods" in response.headers
    
    def test_api_versioning_security(self):
        """Test API versioning doesn't expose vulnerabilities."""
        # Test different API versions
        versions = ["v1", "v2"]
        
        for version in versions:
            response = self.client.get(
                f"/api/{version}/health",
                headers={"Authorization": "Bearer valid_token"}
            )
            
            # Should handle versioning securely
            assert response.status_code != status.HTTP_500_INTERNAL_SERVER_ERROR
    
    def test_error_message_sanitization(self):
        """Test that error messages don't leak sensitive information."""
        # Trigger various errors
        responses = [
            self.client.get("/api/v1/nonexistent"),
            self.client.get("/api/v1/users/999999"),
            self.client.post("/api/v1/jobs", json={}, headers={"Authorization": "Bearer invalid"})
        ]
        
        for response in responses:
            if response.status_code >= 400:
                error_text = str(response.json())
                # Should not contain sensitive system information
                sensitive_info = ["password", "secret", "token", "database", "internal"]
                for info in sensitive_info:
                    assert info.lower() not in error_text.lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
