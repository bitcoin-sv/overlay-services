import { LookupFormula } from './LookupFormula.js'
import { Script, LookupQuestion, LookupAnswer } from '@bsv/sdk'

/* ---------------------------------------------------------------------------
 *  Modes a Lookup Service may request from the Overlay Services Engine
 * -------------------------------------------------------------------------- */
export type AdmissionMode = 'locking-script' | 'whole-tx'
export type SpendNotificationMode = 'none' | 'txid' | 'script' | 'whole-tx'

/* ---------------------------------------------------------------------------
 *  Admission-Notification payloads
 * -------------------------------------------------------------------------- */
export type OutputAdmittedByTopic =
  | { // «locking-script» mode
    mode: 'locking-script'
    txid: string // ID of the *admitted* transaction
    outputIndex: number // index of admitted output
    topic: string // topic into which it was admitted
    satoshis: number // value of the output
    lockingScript: Script // script in this output
  }
  | { // «whole-tx» mode
    mode: 'whole-tx'
    atomicBEEF: number[] // whole transaction (Atomic BEEF)
    outputIndex: number
    topic: string
  }

/* ---------------------------------------------------------------------------
 *  Spend-Notification payloads
 * -------------------------------------------------------------------------- */
export type OutputSpent =
  | { // «none»      – “it was spent”
    mode: 'none'
    txid: string
    outputIndex: number
    topic: string
  }
  | { // «txid»      – pointer only
    mode: 'txid'
    txid: string
    outputIndex: number
    topic: string
    spendingTxid: string
  }
  | { // «script»    – granular input data
    mode: 'script'
    txid: string
    outputIndex: number
    topic: string
    spendingTxid: string
    inputIndex: number
    unlockingScript: Script
    sequenceNumber: number
  }
  | { // «whole-tx»  – full spending TX
    mode: 'whole-tx'
    txid: string
    outputIndex: number
    topic: string
    spendingAtomicBEEF: number[]
  }

/* ---------------------------------------------------------------------------
 *  Metadata structure returned by getMetaData()
 * -------------------------------------------------------------------------- */
export interface LookupServiceMetaData {
  name: string
  shortDescription: string
  iconURL?: string
  version?: string
  informationURL?: string
}

/* ---------------------------------------------------------------------------
 *  Lookup Service Interface
 * -------------------------------------------------------------------------- */
export interface LookupService {
  /* -------------------------------------------------------------------------
   *  REQUIRED static declarations
   * ----------------------------------------------------------------------- */
  readonly admissionMode: AdmissionMode
  readonly spendNotificationMode: SpendNotificationMode

  /* -------------------------------------------------------------------------
   *  REQUIRED lifecycle hooks
   * ----------------------------------------------------------------------- */
  /**
   * Invoked when a Topic Manager admits a new UTXO.
   * The payload shape depends on this.admissionMode.
   */
  outputAdmittedByTopic: (payload: OutputAdmittedByTopic) => Promise<void> | void

  /**
   * Invoked when a previously-admitted UTXO is spent.
   * The payload shape depends on this.spendNotificationMode.
   */
  outputSpent?: (payload: OutputSpent) => Promise<void> | void

  /**
   * Called when a Topic Manager decides that **historical retention** of the
   * specified UTXO is no longer required.
   */
  outputNoLongerRetainedInHistory?: (
    txid: string,
    outputIndex: number,
    topic: string
  ) => Promise<void> | void

  /**
   * LEGAL EVICTION:
   * Permanently remove the referenced UTXO from all indices maintained by the
   * Lookup Service.  After eviction the service MUST NOT reference the output
   * in any future lookup answer.
   */
  outputEvicted: (
    txid: string,
    outputIndex: number
  ) => Promise<void> | void

  /* -------------------------------------------------------------------------
   *  Query API
   * ----------------------------------------------------------------------- */
  lookup: (question: LookupQuestion) => Promise<LookupAnswer | LookupFormula>

  /* -------------------------------------------------------------------------
   *  Documentation helpers
   * ----------------------------------------------------------------------- */
  getDocumentation: () => Promise<string>
  getMetaData: () => Promise<LookupServiceMetaData>
}
