import requests

response = requests.post(
    'http://127.0.0.1:8000/api/v1/auth/login',
    json={'email': 'jimmybobday@gmail.com', 'password': 'Samdoggy1!'}
)
data = response.json()
token = data.get('access_token')

res = requests.post(
    'http://127.0.0.1:8000/api/ingest',
    headers={'Authorization': f'Bearer {token}'},
    json={'voice_notes': 'Client is ACME Corp. Complete electrical installation of new lighting fixtures in commercial building. 4 hours labor plus materials.'}
)
print('INGEST RESULT:', res.status_code)

res = requests.get(
    'http://127.0.0.1:8000/api/jobs',
    headers={'Authorization': f'Bearer {token}'}
)
print('GET JOBS:', res.status_code, res.text)

