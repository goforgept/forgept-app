import { useEffect, useRef, useState } from 'react'

const PLACES_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY

export default function AddressAutocomplete({ onSelect, inputClass, placeholder = '123 Main St' }) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)
  const wrapRef = useRef(null)

  useEffect(() => {
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const fetchSuggestions = async (input) => {
    if (!input || input.length < 3) { setSuggestions([]); return }
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': PLACES_KEY,
        },
        body: JSON.stringify({
          input,
          includedRegionCodes: ['us'],
          includedPrimaryTypes: ['street_address', 'premise'],
        }),
      })
      const data = await res.json()
      setSuggestions(data.suggestions || [])
      setOpen(true)
    } catch { setSuggestions([]) }
  }

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300)
  }

  const handleSelect = async (suggestion) => {
    const placeId = suggestion.placePrediction?.placeId
    const mainText = suggestion.placePrediction?.structuredFormat?.mainText?.text || ''
    setQuery(mainText)
    setOpen(false)
    setSuggestions([])

    if (!placeId) return

    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}?fields=addressComponents`,
        {
          headers: {
            'X-Goog-Api-Key': PLACES_KEY,
            'X-Goog-FieldMask': 'addressComponents',
          },
        }
      )
      const place = await res.json()
      const components = place.addressComponents || []

      const get = (type) => components.find(c => c.types?.includes(type))
      const streetNumber = get('street_number')?.longText || ''
      const route        = get('route')?.shortText || ''
      const city         = get('locality')?.longText || get('sublocality')?.longText || ''
      const state        = get('administrative_area_level_1')?.shortText || ''
      const zip          = get('postal_code')?.longText || ''

      onSelect({
        address: [streetNumber, route].filter(Boolean).join(' '),
        city,
        state,
        zip,
      })
    } catch { /* let user fill in manually */ }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={inputClass}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-fp-card border border-fp-border rounded-lg shadow-xl overflow-hidden">
          {suggestions.map((s, i) => {
            const pred = s.placePrediction
            const main = pred?.structuredFormat?.mainText?.text || ''
            const secondary = pred?.structuredFormat?.secondaryText?.text || ''
            return (
              <li key={i}>
                <button
                  type="button"
                  onMouseDown={() => handleSelect(s)}
                  className="w-full text-left px-3 py-2 hover:bg-fp-inset transition-colors"
                >
                  <span className="text-fp-text text-sm">{main}</span>
                  {secondary && <span className="text-fp-muted text-xs ml-2">{secondary}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
