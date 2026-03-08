# 📖 SparkOps API Documentation

## Overview

SparkOps provides a comprehensive REST API for voice-to-cash job processing, materials management, telecommunications integration, and GPS tracking. This documentation is intended for both AI agents and human developers integrating with the platform.

## Base URL

```
Production: https://your-api.railway.app
Development: http://127.0.0.1:8000
```

## Authentication

### JWT Bearer Token
All API endpoints (except health checks) require a Supabase JWT token in the Authorization header:

```http
Authorization: Bearer <supabase_jwt_token>
```

### Token Validation
- Tokens are decoded and validated against Supabase JWT secret
- User profiles are automatically provisioned if needed
- Role-based access control (OWNER vs EMPLOYEE) is enforced

## API Endpoints

### Health & Status

#### GET /health
Check API health status.

**Response:**
```json
{
  "status": "healthy",
  "service": "sparkops-api",
  "timestamp": "2024-03-08T15:30:00Z"
}
```

---

### Authentication

#### GET /api/auth/me
Get current user profile and role information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "OWNER",
  "organization_id": "uuid",
  "full_name": "John Smith"
}
```

#### GET /api/v1/auth/handshake
Versioned authentication handshake for future compatibility.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": "authenticated",
  "user_id": "uuid",
  "role": "OWNER",
  "version": "v1"
}
```

---

### Job Management

#### POST /api/ingest
Process voice notes or receipt images into structured job data.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (Voice):**
```json
{
  "audio_base64": "base64_encoded_webm_audio_data",
  "transcript": "installed hot water cylinder in cupboard",
  "type": "voice"
}
```

**Request Body (Receipt):**
```json
{
  "image_base64": "base64_encoded_jpg_image_data",
  "type": "receipt"
}
```

**Response:**
```json
{
  "id": "job_draft_uuid",
  "status": "processed",
  "extracted_data": {
    "client": "John Smith",
    "materials": [
      {
        "description": "Horizontal Hot Water Cylinder",
        "quantity": 1,
        "unit_price": 450.00
      }
    ],
    "labor_hours": 3,
    "urgency": "Medium",
    "notes": "Installed in ceiling cavity"
  },
  "created_at": "2024-03-08T15:30:00Z"
}
```

#### GET /api/jobs
List job drafts with role-based filtering.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (optional): Number of jobs to return (default: 50)
- `offset` (optional): Number of jobs to skip (default: 0)

**Response:**
```json
[
  {
    "id": "uuid",
    "client_name": "John Smith",
    "status": "draft",
    "created_at": "2024-03-08T15:30:00Z",
    "total_amount": 585.00
  }
]
```

#### GET /api/jobs/{job_id}
Get detailed information for a specific job draft.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "organization_id": "uuid",
  "extracted_data": {
    "client": "John Smith",
    "materials": [...],
    "labor_hours": 3,
    "urgency": "Medium"
  },
  "status": "draft",
  "created_at": "2024-03-08T15:30:00Z",
  "updated_at": "2024-03-08T15:30:00Z"
}
```

#### DELETE /api/jobs/{job_id}
Delete a job draft (requires ownership or OWNER role).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "status": "deleted",
  "id": "uuid"
}
```

#### GET /api/jobs/{job_id}/pdf
Download PDF invoice for a job draft.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
- Content-Type: application/pdf
- Content-Disposition: attachment; filename="invoice-{job_id}.pdf"
- Binary PDF data

---

### Materials Management

#### POST /api/materials/upload
Upload CSV file for async materials processing.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Request Body:**
```
file: CSV file (JA Russell or Corys format)
```

**Response:**
```json
{
  "upload_id": "uuid",
  "status": "uploaded",
  "message": "File uploaded successfully for processing"
}
```

#### POST /api/materials/import
Import materials from uploaded CSV file.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "upload_id": "uuid"
}
```

**Response:**
```json
{
  "imported_count": 1250,
  "failed_count": 5,
  "total_rows": 1255,
  "message": "Import completed successfully"
}
```

---

### Telecommunications (Twilio Integration)

#### POST /api/twilio/voice
Handle incoming voice calls and generate TwiML responses.

**Headers:**
```
X-Twilio-Signature: <twilio_signature>
Content-Type: application/x-www-form-urlencoded
```

**Request Body:**
```
From: +64212345678
To: +64298765432
CallSid: call_uuid
```

**Response:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="woman">Please leave a message after the tone.</Say>
  <Record action="/api/twilio/recording" maxLength="60" />
</Response>
```

#### POST /api/twilio/recording
Process voicemail recording and trigger AI triage.

**Headers:**
```
X-Twilio-Signature: <twilio_signature>
Content-Type: application/x-www-form-urlencoded
```

**Request Body:**
```
RecordingUrl: https://api.twilio.com/...
CallSid: call_uuid
From: +64212345678
```

**Response:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="woman">Thank you for your message. We'll call you back shortly.</Say>
  <Hangup />
</Response>
```

#### GET /api/twilio/voicemails
Get list of processed voicemail messages.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "from_number": "+64212345678",
    "urgency": "High",
    "summary": "Emergency power outage at commercial property",
    "created_at": "2024-03-08T15:30:00Z"
  }
]
```

#### GET /api/twilio/ladder-mode
Get current Ladder Mode activation status.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "enabled": true,
  "activated_at": "2024-03-08T14:00:00Z",
  "activated_by": "user_uuid"
}
```

#### POST /api/twilio/ladder-mode
Toggle Ladder Mode on or off.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "enabled": true
}
```

**Response:**
```json
{
  "enabled": true,
  "message": "Ladder Mode activated successfully"
}
```

---

### GPS Tracking

#### POST /api/eta/generate
Generate secure tracking link for job site.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "job_id": "uuid",
  "client_phone": "+64212345678",
  "address": "123 Queen Street, Auckland"
}
```

**Response:**
```json
{
  "tracking_id": "secure_uuid",
  "tracking_url": "https://your-app.vercel.app/tracking/secure_uuid",
  "sms_sent": true,
  "expires_at": "2024-03-08T18:30:00Z"
}
```

#### GET /api/eta/lookup/{tracking_id}
Lookup tracking data for public tracking page.

**Path Parameters:**
- `tracking_id`: Secure tracking identifier

**Response:**
```json
{
  "id": "secure_uuid",
  "latitude": -36.8485,
  "longitude": 174.7633,
  "eta_minutes": 25,
  "status": "On the way",
  "updated_at": "2024-03-08T15:30:00Z"
}
```

---

## Data Models

### JobDraft
```typescript
interface JobDraft {
  id: string;
  user_id: string;
  organization_id: string;
  extracted_data: {
    client?: string;
    materials?: Array<{
      description: string;
      quantity: number;
      unit_price: number;
    }>;
    labor_hours?: number;
    urgency?: "High" | "Medium" | "Low";
    notes?: string;
  };
  status: "draft" | "reviewed" | "invoiced";
  created_at: string;
  updated_at: string;
}
```

### Material
```typescript
interface Material {
  id: string;
  name: string;
  description?: string;
  trade_price: number;
  retail_price: number;
  supplier: string;
  category?: string;
  embedding?: number[]; // Vector for semantic search
  created_at: string;
}
```

### User
```typescript
interface User {
  id: string;
  email: string;
  role: "OWNER" | "EMPLOYEE";
  organization_id: string;
  full_name?: string;
  created_at: string;
}
```

---

## Error Handling

### Standard Error Response
```json
{
  "detail": "Error message description",
  "status_code": 400,
  "error_type": "validation_error"
}
```

### Common HTTP Status Codes
- `200 OK`: Request successful
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Missing or invalid authentication
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `422 Unprocessable Entity`: Validation error
- `500 Internal Server Error`: Server error

### Authentication Errors
```json
{
  "detail": "Missing bearer token.",
  "status_code": 401
}
```

### Permission Errors
```json
{
  "detail": "Insufficient permissions for this job draft.",
  "status_code": 403
}
```

### Validation Errors
```json
{
  "detail": [
    {
      "loc": ["body", "audio_base64"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

---

## Rate Limiting

### Recommended Limits
- **Authentication endpoints**: 10 requests/minute
- **Job ingestion**: 60 requests/hour per user
- **Materials upload**: 10 requests/hour per organization
- **Tracking generation**: 100 requests/hour per user

### Rate Limit Headers
```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1646772000
```

---

## SDK Examples

### Python/FastAPI Client
```python
import httpx

class SparkOpsClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
    
    async def ingest_voice(self, audio_base64: str, transcript: str):
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/api/ingest",
                headers=self.headers,
                json={
                    "audio_base64": audio_base64,
                    "transcript": transcript,
                    "type": "voice"
                }
            )
            return response.json()
    
    async def list_jobs(self, limit: int = 50):
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/api/jobs",
                headers=self.headers,
                params={"limit": limit}
            )
            return response.json()
```

### JavaScript/TypeScript Client
```typescript
class SparkOpsAPI {
  constructor(private baseURL: string, private token: string) {}
  
  private headers = {
    'Authorization': `Bearer ${this.token}`,
    'Content-Type': 'application/json'
  };
  
  async ingestVoice(audioBase64: string, transcript: string) {
    const response = await fetch(`${this.baseURL}/api/ingest`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        audio_base64: audioBase64,
        transcript,
        type: 'voice'
      })
    });
    return response.json();
  }
  
  async listJobs(limit = 50) {
    const response = await fetch(`${this.baseURL}/api/jobs?limit=${limit}`, {
      headers: this.headers
    });
    return response.json();
  }
  
  async generateTracking(jobId: string, clientPhone: string, address: string) {
    const response = await fetch(`${this.baseURL}/api/eta/generate`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        job_id: jobId,
        client_phone: clientPhone,
        address
      })
    });
    return response.json();
  }
}
```

---

## Testing

### Health Check
```bash
curl https://your-api.railway.app/health
```

### Authentication Test
```bash
curl -H "Authorization: Bearer <token>" \
     https://your-api.railway.app/api/auth/me
```

### Job Ingestion Test
```bash
curl -X POST \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"audio_base64":"base64data","transcript":"test","type":"voice"}' \
     https://your-api.railway.app/api/ingest
```

---

## Webhook Integration

### Twilio Webhook Setup
1. Configure your Twilio phone number voice URL
2. Set webhook URL to: `https://your-api.railway.app/api/twilio/voice`
3. Enable signature validation in Twilio console
4. Test with Twilio's webhook testing tools

### Webhook Security
- All Twilio webhooks validate `X-Twilio-Signature` header
- Requests without valid signatures are rejected
- Use HTTPS for all webhook endpoints

---

## Changelog

### v1.0.0
- Initial API release
- Complete job management endpoints
- Authentication and authorization
- Materials management
- Twilio integration
- GPS tracking system

### Future Versions
- GraphQL API support
- WebSocket real-time updates
- Advanced analytics endpoints
- Multi-tenant support

---

## Support

For API support and integration assistance:
- Review this documentation thoroughly
- Test endpoints using the provided examples
- Check error responses for debugging information
- Contact development team for production integration issues

---

*🔥 SparkOps API - Voice-to-cash platform for NZ electrical contractors*