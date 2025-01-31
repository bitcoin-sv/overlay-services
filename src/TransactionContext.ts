import { AdmittanceInstructions, Transaction } from "@bsv/sdk";


export interface ExtendedAdmittanceInstructions extends AdmittanceInstructions{
    inputData?: unknown[]

    outputData?: unknown[]
}

export interface TransactionContext {
    txid: string
    transaction: Transaction
    topicData: {[topic: string]: ExtendedAdmittanceInstructions}
}