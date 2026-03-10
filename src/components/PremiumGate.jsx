export default function PremiumGate({ children }) {
  return children ?? null
}

export function usePremiumGate() {
  return {
    isPremium: true,
    gate: null,
    showModal: false,
    setShowModal: () => {},
  }
}
