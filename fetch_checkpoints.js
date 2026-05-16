async function run() {
  const login = await fetch('https://patrolsecurity-ecosystem.onrender.com/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@securecorp.com', password: '123456' })
  }).then(r => r.json());
  
  if (!login.token) { console.log('Login failed', login); return; }
  
  const cps = await fetch('https://patrolsecurity-ecosystem.onrender.com/api/v1/checkpoints', {
    headers: { 'Authorization': `Bearer ${login.token}` }
  }).then(r => r.json());
  
  console.log('Checkpoints in DB:', JSON.stringify(cps, null, 2));
}
run();
