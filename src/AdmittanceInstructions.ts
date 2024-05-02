/**
 * Instructs the Overlay Services Engine about which outputs to admit and which previous outputs to retain. Returned by a Topic Manager.
 */
export type AdmittanceInstructions = {
    /**
     * The indicies of all admissable outputs into the managed topic from the provided transaction.
     */
    outputsToAdmit: number[]

    /**
     * The indicies of all inputs from the provided transaction which spend previously-admitted outputs that should be retained for historical record-keeping.
     */
    coinsToRetain: number[]
}
