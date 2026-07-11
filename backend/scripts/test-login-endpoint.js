async function test() {
  const credentials = [
    { name: 'Admin', email: 'admin@vms.com', password: 'admin123' },
    { name: 'Inventory Manager', email: 'inventory@vms.com', password: 'manager123' },
    { name: 'Production Manager', email: 'production@vms.com', password: 'manager123' }
  ];

  for (let cred of credentials) {
    try {
      console.log(`\nTesting login for ${cred.name} (${cred.email})...`);
      const response = await fetch('http://127.0.0.1:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cred.email, password: cred.password })
      });
      const data = await response.json();
      console.log('Status Code:', response.status);
      console.log('Response:', data);
    } catch (err) {
      console.error('Request failed:', err.message);
    }
  }
}

test();
