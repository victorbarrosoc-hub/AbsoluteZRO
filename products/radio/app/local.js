// Modo local: escolhe o nome deste navegador e recarrega (o servidor guarda num cookie só deste teste).
document.getElementById('local').addEventListener('submit', async (e) => {
  e.preventDefault()
  const nome = document.getElementById('local-nome').value.trim()
  if (!nome) return
  const r = await fetch('/api/local', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome }) })
  if (r.ok) location.reload()
})
