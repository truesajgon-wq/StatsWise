export function getValuePickConfidenceBadgeStyle(confidence) {
  if (confidence > 90) {
    return {
      color: '#facc15',
      background: 'rgba(250,204,21,0.14)',
      border: '1px solid rgba(250,204,21,0.34)',
    }
  }

  if (confidence > 80 && confidence <= 90) {
    return {
      color: '#22c55e',
      background: 'rgba(34,197,94,0.10)',
      border: '1px solid rgba(34,197,94,0.30)',
    }
  }

  return {
    color: '#ffb36b',
    background: 'rgba(255,122,0,0.12)',
    border: '1px solid rgba(255,122,0,0.30)',
  }
}

export function getValuePickConfidenceTier(confidence) {
  if (confidence > 90) return '90%+ elite edge'
  if (confidence > 80) return '80%+ strong edge'
  return '<=80% value angle'
}
