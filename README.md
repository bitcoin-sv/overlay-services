# BSV Overlay Services Engine

BSV BLOCKCHAIN | Overlay Services Engine

The Overlay Services Engine enables dynamic tracking and management of UTXO-based systems that work on top of the BSV blockchain.

## Table of Contents

1. [Objective](#objective)
2. [Getting Started](#getting-started)
3. [Features & Deliverables](#features--deliverables)
4. [Documentation](#documentation)
5. [Contribution Guidelines](#contribution-guidelines)
6. [Support & Contacts](#support--contacts)

## Objective

- Enable a general-purpose system for tracking UTXOs
- Let each service decide what UTXOs get into the system
- Provide an efficient global storage engine for UTXO data
- Let each lookup service dynamically respond to different types of queries
- Let each lookup service have its own, specialized storage engine for its unique needs

## Getting Started

### Installation

You'll usually want to wrap the Engine within an HTTP server. To get set up with Express, create a new project and install everything you'll need:

```
npm i express body-parser @bsv/sdk @bsv/overlay hello-services knex
```

### Basic Usage

In your server's main file, you can set everything up. Create a new Engine to run the overlay services you want, then expose some routes over HTTP. For example:

```js
const express = require('express')
const bodyparser = require('body-parser')
const { Engine, KnexStorage, HelloTopicManager, HelloLookupService, HelloStorageEngine } = require('@bsv/overlay')
const { WoChain } = require('@bsv/sdk')
// Populate a Knexfile with your database credentials
const knex = require('knex')(require('../knexfile.js'))
const app = express()
app.use(bodyparser.json({ limit: '1gb', type: 'application/json' }))

const engine = new Engine(
    {
      hello: new HelloTopicManager(),
    },
    {
      hello: new HelloLookupService({
        storageEngine: new HelloStorageEngine({
          knex
        })
      }),
    },
    new KnexStorageEngine({
      knex
    })
  )

// This allows the API to be used everywhere when CORS is enforced
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', '*')
  res.header('Access-Control-Allow-Methods', '*')
  res.header('Access-Control-Expose-Headers', '*')
  res.header('Access-Control-Allow-Private-Network', 'true')
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})

// Serve a static documentstion site, if you have one.
app.use(express.static('public'))

// List hosted topic managers and lookup services
app.get(`/listTopicManagers`, async (req, res) => {
  try {
    const result = await engine.listTopicManagers()
    return res.status(200).json(result)
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      code: error.code,
      description: error.message
    })
  }
})
app.get(`/listLookupServiceProviders`, async (req, res) => {
  try {
    const result = await engine.listLookupServiceProviders()
    return res.status(200).json(result)
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      code: error.code,
      description: error.message
    })
  }
})

// Host documentation for the services
app.get(`/getDocumentationForTopicManager`, async (req, res) => {
  try {
    const result = await engine.getDocumentationForTopicManger(req.query.manager)
    return res.status(200).json(result)
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      code: error.code,
      description: error.message
    })
  }
})
app.get(`/getDocumentationForLookupServiceProvider`, async (req, res) => {
  try {
    const result = await engine.getDocumentationForLookupServiceProvider(req.query.lookupServices)
    return res.status(200).json(result)
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      code: error.code,
      description: error.message
    })
  }
})

// Submit transactions and facilitate lookup requests
app.post(`/submit`, async (req, res) => {
  try {
    const result = await engine.submit(req.body)
    return res.status(200).json(result)
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      code: error.code,
      description: error.message
    })
  }
})
app.post(`/lookup`, async (req, res) => {
  try {
    const result = await engine.lookup(req.body)
    return res.status(200).json(result)
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      code: error.code,
      description: error.message
    })
  }
})

// 404, all other routes are not found.
app.use((req, res) => {
  console.log('404', req.url)
  res.status(404).json({
    status: 'error',
    code: 'ERR_ROUTE_NOT_FOUND',
    description: 'Route not found.'
  })
})

// Start your Engines!
  app.listen(8080, () => {
    console.log('BSV Overlay Services Engine is listening on port', 8080)
  })
```

For more detailed tutorials and examples, check out the [full documentation](#documentation).

The Overlay Services Engine is also richly documented with code-level annotations. This should show up well within editors like VSCode. 

<!-- ## Documentation

[links to conceptsexamples and internals] -->

## Features & Deliverables

- UTXO Tracking
- History management and state tracking
- Lookup Services
- Storage engine abstractions
- [WIP] Examples, HTTP wrapper and Docs
- [WIP] Arc Proof Acquisition
- [WIP] Distributed Overlay Availability Advertisements
- [WIP] Federated Transaction Synchronization

## Contribution Guidelines

We're always looking for contributors to help us improve the Engine. Whether it's bug reports, feature requests, or pull requests - all contributions are welcome.

1. **Fork & Clone**: Fork this repository and clone it to your local machine.
2. **Set Up**: Run `npm i` to install all dependencies.
3. **Make Changes**: Create a new branch and make your changes.
4. **Test**: Ensure all tests pass by running `npm test`.
5. **Commit**: Commit your changes and push to your fork.
6. **Pull Request**: Open a pull request from your fork to this repository.
For more details, check the [contribution guidelines](./CONTRIBUTING.md).

For information on past releases, check out the [changelog](./CHANGELOG.md). For future plans, check the [roadmap](./ROADMAP.md)!

## Support & Contacts

Project Owners: Thomas Giacomo, Darren Kellenschwiler, Jake Jones

Development Team Lead: Ty Everett

For questions, bug reports, or feature requests, please open an issue on GitHub or contact us directly.

## License

The license for the code in this repository is the Open BSV License. Refer to [LICENSE.txt](./LICENSE.txt) for the license text.

Thank you for being a part of the BSV Blockchain Overlay Services Project. Let's build the future of BSV Blockchain together!
