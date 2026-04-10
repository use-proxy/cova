import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore } from '@/lib/store/session'

// Test using zustand store API directly — avoids React dual-instance issues
// in monorepo where @testing-library/react is at root node_modules
describe('useSessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({
      currentStep: 1,
      isLoading: false,
      error: null,
    })
  })

  it('initializes at step 1', () => {
    expect(useSessionStore.getState().currentStep).toBe(1)
  })

  it('nextStep increments current step', () => {
    useSessionStore.getState().nextStep()
    expect(useSessionStore.getState().currentStep).toBe(2)
  })

  it('prevStep decrements current step', () => {
    useSessionStore.getState().setStep(5)
    useSessionStore.getState().prevStep()
    expect(useSessionStore.getState().currentStep).toBe(4)
  })

  it('nextStep does not exceed step 9', () => {
    useSessionStore.getState().setStep(9)
    useSessionStore.getState().nextStep()
    expect(useSessionStore.getState().currentStep).toBe(9)
  })

  it('prevStep does not go below step 1', () => {
    useSessionStore.getState().setStep(1)
    useSessionStore.getState().prevStep()
    expect(useSessionStore.getState().currentStep).toBe(1)
  })

  it('setLoading updates loading state', () => {
    useSessionStore.getState().setLoading(true)
    expect(useSessionStore.getState().isLoading).toBe(true)
  })

  it('setError updates error state', () => {
    useSessionStore.getState().setError('Something went wrong')
    expect(useSessionStore.getState().error).toBe('Something went wrong')
  })

  it('resetSession returns to initial state', () => {
    useSessionStore.getState().setStep(7)
    useSessionStore.getState().setError('error')
    useSessionStore.getState().resetSession()
    expect(useSessionStore.getState().currentStep).toBe(1)
    expect(useSessionStore.getState().error).toBeNull()
    expect(useSessionStore.getState().isLoading).toBe(false)
  })

  it('setStep accepts values 1 through 9', () => {
    for (let step = 1; step <= 9; step++) {
      useSessionStore.getState().setStep(step)
      expect(useSessionStore.getState().currentStep).toBe(step)
    }
  })
})
