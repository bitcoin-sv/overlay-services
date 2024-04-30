# API

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

## Interfaces

| |
| --- |
| [LookupService](#interface-lookupservice) |
| [Storage](#interface-storage) |
| [TopicManager](#interface-topicmanager) |

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---

### Interface: TopicManager

Defines a Topic Manager interface that can be implemented for specific use-cases

```ts
export default interface TopicManager {
    identifyAdmissibleOutputs(beef: number[], previousCoins: number[]): Promise<AdmittanceInstructions>;
    getDocumentation(): Promise<string>;
    getMetaData(): Promise<{
        name: string;
        shortDescription: string;
        iconURL?: string;
        version?: string;
        informationURL?: string;
    }>;
}
```

<details>

<summary>Interface TopicManager Details</summary>

#### Method getDocumentation

Returns a Markdown-formatted documentation string for the topic manager.

```ts
getDocumentation(): Promise<string>
```

#### Method getMetaData

Returns a metadata object that can be used to identify the topic manager.

```ts
getMetaData(): Promise<{
    name: string;
    shortDescription: string;
    iconURL?: string;
    version?: string;
    informationURL?: string;
}>
```

#### Method identifyAdmissibleOutputs

Returns instructions that denote which outputs from the provided transaction to admit into the topic, and which previous coins should be retained.
Accepts the transaction in BEEF format and an array of those input indicies which spend previously-admitted outputs from the same topic.
The transaction's BEEF structure will always contain the transactions associated with previous coins for reference (if any), regardless of whether the current transaction was directly proven.

```ts
identifyAdmissibleOutputs(beef: number[], previousCoins: number[]): Promise<AdmittanceInstructions>
```

</details>

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---
### Interface: LookupService

Defines a Lookup Service interface to be implemented for specific use-cases

```ts
export default interface LookupService {
    outputAdded?(txid: string, outputIndex: number, outputScript: Script, topic: string): Promise<void>;
    outputSpent?(txid: string, outputIndex: number, topic: string): Promise<void>;
    outputDeleted?(txid: string, outputIndex: number, topic: string): Promise<void>;
    lookup(question: LookupQuestion): Promise<LookupAnswer | LookupFormula>;
    getDocumentation(): Promise<string>;
    getMetaData(): Promise<{
        name: string;
        shortDescription: string;
        iconURL?: string;
        version?: string;
        informationURL?: string;
    }>;
}
```

<details>

<summary>Interface LookupService Details</summary>

#### Method getDocumentation

Returns a Markdown-formatted documentation string for the lookup service.

```ts
getDocumentation(): Promise<string>
```

#### Method getMetaData

Returns a metadata object that can be used to identify the lookup service.

```ts
getMetaData(): Promise<{
    name: string;
    shortDescription: string;
    iconURL?: string;
    version?: string;
    informationURL?: string;
}>
```

#### Method lookup

Queries the lookup service for information

```ts
lookup(question: LookupQuestion): Promise<LookupAnswer | LookupFormula>
```

Returns

— The Lookup Answer or Lookup Formula used to answer the question

Argument Details

+ **question**
  + — The question to be answered by the lookup service

#### Method outputAdded

Process the event when a new UTXO is let into a topic

```ts
outputAdded?(txid: string, outputIndex: number, outputScript: Script, topic: string): Promise<void>
```

#### Method outputDeleted

Process the deletion event for a UTXO

```ts
outputDeleted?(txid: string, outputIndex: number, topic: string): Promise<void>
```

#### Method outputSpent

Process the spend event for a UTXO

```ts
outputSpent?(txid: string, outputIndex: number, topic: string): Promise<void>
```

</details>

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---
### Interface: Storage

Defines the Storage Engine interface used internally by the Overlay Services Engine.

```ts
export default interface Storage {
    insertOutput(utxo: Output): Promise<void>;
    findOutput(txid: string, outputIndex: number, topic?: string, spent?: boolean): Promise<Output | null>;
    deleteOutput(txid: string, outputIndex: number, topic: string): Promise<void>;
    markUTXOAsSpent(txid: string, outputIndex: number, topic: string): Promise<void>;
    updateConsumedBy(txid: string, outputIndex: number, topic: string, consumedBy: {
        txid: string;
        outputIndex: number;
    }[]): Promise<void>;
    insertAppliedTransaction(tx: AppliedTransaction): Promise<void>;
    doesAppliedTransactionExist(tx: AppliedTransaction): Promise<boolean>;
}
```

<details>

<summary>Interface Storage Details</summary>

#### Method deleteOutput

Deletes an output from storage

```ts
deleteOutput(txid: string, outputIndex: number, topic: string): Promise<void>
```

Argument Details

+ **txid**
  + — The TXID of the output to delete
+ **outputIndex**
  + — The index of the output to delete
+ **topic**
  + — The topic where the output should be deleted

#### Method doesAppliedTransactionExist

Checks if a duplicate transaction exists

```ts
doesAppliedTransactionExist(tx: AppliedTransaction): Promise<boolean>
```

Returns

Whether the transaction is already applied

Argument Details

+ **tx**
  + — Transaction to check

#### Method findOutput

Finds an output from storage

```ts
findOutput(txid: string, outputIndex: number, topic?: string, spent?: boolean): Promise<Output | null>
```

Argument Details

+ **txid**
  + — TXID of hte output to find
+ **outputIndex**
  + — Output index for the output to find
+ **topic**
  + — The topic in which the output is stored
+ **spent**
  + — Whether the output must be spent to be returned

#### Method insertAppliedTransaction

Inserts record of the applied transaction

```ts
insertAppliedTransaction(tx: AppliedTransaction): Promise<void>
```

Argument Details

+ **tx**
  + — The transaction to insert

#### Method insertOutput

Adds a new output to storage

```ts
insertOutput(utxo: Output): Promise<void>
```

Argument Details

+ **utxo**
  + — The output to add

#### Method markUTXOAsSpent

Updates a UTXO as spent

```ts
markUTXOAsSpent(txid: string, outputIndex: number, topic: string): Promise<void>
```

Argument Details

+ **txid**
  + — TXID of the output to update
+ **outputIndex**
  + — Index of the output to update
+ **topic**
  + — Topic in which the output should be updated

#### Method updateConsumedBy

Updates which outputs are consumed by this output

```ts
updateConsumedBy(txid: string, outputIndex: number, topic: string, consumedBy: {
    txid: string;
    outputIndex: number;
}[]): Promise<void>
```

Argument Details

+ **txid**
  + — TXID of the output to update
+ **outputIndex**
  + — Index of the output to update
+ **topic**
  + — Topic in which the output should be updated
+ **consumedBy**
  + — The new set of outputs consumed by this output

</details>

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---
## Classes

| |
| --- |
| [Engine](#class-engine) |
| [KnexStorage](#class-knexstorage) |

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---

### Class: Engine

Am engine for running BSV Overlay Services (topic managers and lookup services).

```ts
export default class Engine {
    constructor(public managers: {
        [key: string]: TopicManager;
    }, public lookupServices: {
        [key: string]: LookupService;
    }, public storage: Storage, public chainTracker: ChainTracker) 
    async submit(taggedBEEF: TaggedBEEF): Promise<STEAK> 
    async lookup(lookupQuestion: LookupQuestion): Promise<LookupAnswer> 
    async listTopicManagers(): Promise<string[]> 
    async listLookupServiceProviders(): Promise<string[]> 
    async getDocumentationForTopicManger(manager: any): Promise<string> 
    async getDocumentationForLookupServiceProvider(provider: any): Promise<string> 
}
```

<details>

<summary>Class Engine Details</summary>

#### Constructor

Creates a new Overlay Services Engine

```ts
constructor(public managers: {
    [key: string]: TopicManager;
}, public lookupServices: {
    [key: string]: LookupService;
}, public storage: Storage, public chainTracker: ChainTracker) 
```

Argument Details

+ ****
  + : TopicManager} managers - manages topic admittance
+ ****
  + : LookupService} lookupServices - manages UTXO lookups
+ **storage**
  + for interacting with internally-managed persistent data
+ **chainTracker**
  + Verifies SPV data associated with transactions
+ **proofNotifiers**
  + proof notifier services coming soon!

#### Method getDocumentationForLookupServiceProvider

Run a query to get the documentation for a particular lookup service

```ts
async getDocumentationForLookupServiceProvider(provider: any): Promise<string> 
```

Returns

-  the documentation for the lookup service

#### Method getDocumentationForTopicManger

Run a query to get the documentation for a particular topic manager

```ts
async getDocumentationForTopicManger(manager: any): Promise<string> 
```

Returns

- the documentation for the topic manager

#### Method listLookupServiceProviders

Find a list of supported lookup services

```ts
async listLookupServiceProviders(): Promise<string[]> 
```

Returns

- array of supported lookup services

#### Method listTopicManagers

Find a list of supported topic managers

```ts
async listTopicManagers(): Promise<string[]> 
```

Returns

- array of supported topic managers

#### Method lookup

Submit a lookup question to the Overlay Services Engine, and receive bakc a Lookup Answer

```ts
async lookup(lookupQuestion: LookupQuestion): Promise<LookupAnswer> 
```

Returns

The answer to the question

Argument Details

+ **LookupQuestion**
  + — The question to ask the Overlay Services Engine

#### Method submit

Submits a transaction for processing by Overlay Services.

```ts
async submit(taggedBEEF: TaggedBEEF): Promise<STEAK> 
```

Returns

The submitted transaction execution acknowledgement

Argument Details

+ **taggedBEEF**
  + — The transaction to process

</details>

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---
### Class: KnexStorage

```ts
export default class KnexStorage implements Storage {
    knex: Knex;
    constructor(knex: Knex) 
    async findOutput(txid: string, outputIndex: number, topic?: string, spent?: boolean): Promise<Output | null> 
    async deleteOutput(txid: string, outputIndex: number, topic: string): Promise<void> 
    async insertOutput(output: Output) 
    async markUTXOAsSpent(txid: string, outputIndex: number, topic?: string): Promise<void> 
    async updateConsumedBy(txid: string, outputIndex: number, topic: string, consumedBy: {
        txid: string;
        outputIndex: number;
    }[]) 
    async insertAppliedTransaction(tx: {
        txid: string;
        topic: string;
    }) 
    async doesAppliedTransactionExist(tx: {
        txid: string;
        topic: string;
    }): Promise<boolean> 
}
```

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---
## Types

| |
| --- |
| [AdmittanceInstructions](#type-admittanceinstructions) |
| [LookupAnswer](#type-lookupanswer) |
| [LookupFormula](#type-lookupformula) |
| [LookupQuestion](#type-lookupquestion) |
| [Output](#type-output) |
| [STEAK](#type-steak) |
| [TaggedBEEF](#type-taggedbeef) |

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---

### Type: AdmittanceInstructions

Instructs the Overlay Services Engine about which outputs to admit and which previous outputs to retain. Returned by a Topic Manager.

```ts
export type AdmittanceInstructions = {
    outputsToAdmit: number[];
    coinsToRetain: number[];
}
```

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---
### Type: LookupQuestion

The question asked to the Overlay Services Engine when a consumer of state wishes to look up information.

```ts
export type LookupQuestion = {
    service: string;
    query: unknown;
}
```

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---
### Type: LookupFormula

The formula that will be used by the Overlay Services Engine to compute the Lookup Answer. Can be returned by Lookup Services in response to a Lookup Question.

```ts
export type LookupFormula = {
    txid: string;
    outputIndex: number;
    history?: ((beef: number[], outputIndex: number, currentDepth: number) => Promise<boolean>) | number;
}[]
```

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---
### Type: LookupAnswer

How the Overlay Services Engine responds to a Lookup Question.
It may comprise either an output list or a freeform response from the Lookup Service.

```ts
export type LookupAnswer = {
    type: "output-list";
    outputs: Array<{
        beef: number[];
        outputIndex: number;
    }>;
} | {
    type: "freeform";
    result: unknown;
}
```

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---
### Type: Output

Represents an output to be tracked by the Overlay Services Engine

```ts
export type Output = {
    txid: string;
    outputIndex: number;
    outputScript: number[];
    satoshis: number;
    topic: string;
    spent: boolean;
    beef: number[];
    outputsConsumed: {
        txid: string;
        outputIndex: number;
    }[];
    consumedBy: {
        txid: string;
        outputIndex: number;
    }[];
}
```

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---
### Type: TaggedBEEF

Tagged BEEF

```ts
export type TaggedBEEF = {
    beef: number[];
    topics: string[];
}
```

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---
### Type: STEAK

Submitted Transaction Execution AcKnowledgment

```ts
export type STEAK = Record<string, AdmittanceInstructions>
```

Links: [API](#api), [Interfaces](#interfaces), [Classes](#classes), [Types](#types)

---
