// Returns the display name for a client record.
// Residential → "First Last" (company optional/secondary)
// Commercial  → company name
export const clientName = (client) => {
  if (!client) return ''
  if (client.client_type === 'residential') {
    const full = [client.first_name, client.last_name].filter(Boolean).join(' ')
    return full || client.company || 'Unnamed'
  }
  return client.company || client.client_name || 'Unnamed'
}
