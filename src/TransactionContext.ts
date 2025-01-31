import { AdmittanceInstructions, Transaction } from "@bsv/sdk";


export interface ExtendedAdmittanceInstructions extends AdmittanceInstructions{
    inputData?: unknown[]

    outputputData?: unknown[]
}

export interface TransactionContext {
    txid: string
    transaction: Transaction
    topicData: {[topic: string]: ExtendedAdmittanceInstructions}
}