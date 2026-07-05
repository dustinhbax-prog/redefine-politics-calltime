// Render smoke tests for pure presentational components — enough to catch
// import-time crashes and obvious render regressions without mocking the API.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PartyBadge from '../components/PartyBadge'

describe('PartyBadge', () => {
  it('renders a dash for missing party', () => {
    render(<PartyBadge party={null} />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('renders known parties with confidence', () => {
    render(<PartyBadge party="DEM" confidence={0.92} />)
    expect(screen.getByText(/DEM/)).toBeTruthy()
  })

  it('renders SPLIT and unknown parties without crashing', () => {
    render(<PartyBadge party="SPLIT" />)
    render(<PartyBadge party="???" />)
    expect(screen.getAllByText(/SPLIT|\?\?\?/).length).toBeGreaterThan(0)
  })
})
