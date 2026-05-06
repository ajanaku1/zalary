import { loadMoonPay } from '@moonpay/moonpay-js'

const MOONPAY_API_KEY = import.meta.env.VITE_MOONPAY_API_KEY || ''
const MOONPAY_ENV = (import.meta.env.VITE_MOONPAY_ENV || 'sandbox') as 'sandbox' | 'production'

let moonPayInstance: ReturnType<Awaited<ReturnType<typeof loadMoonPay>>> | null = null

export async function openMoonPaySell(quoteCurrencyCode: string = 'usd') {
  if (!MOONPAY_API_KEY) {
    console.warn('MoonPay: No API key configured')
    return
  }

  try {
    const moonPay = await loadMoonPay()
    if (!moonPay) return

    moonPayInstance = moonPay({
      flow: 'sell',
      environment: MOONPAY_ENV,
      variant: 'overlay',
      params: {
        apiKey: MOONPAY_API_KEY,
        theme: 'dark',
        baseCurrencyCode: 'usdc_sol',
        quoteCurrencyCode,
      },
    })

    moonPayInstance?.show()
  } catch (e) {
    console.error('MoonPay error:', e)
  }
}

export function closeMoonPay() {
  moonPayInstance?.close()
  moonPayInstance = null
}
