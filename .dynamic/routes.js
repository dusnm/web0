const os = require('os')
const fs = require('fs')
const path = require('path')
const SMTPServer = require('smtp-server').SMTPServer
const simpleParser = require('mailparser').simpleParser
const sendMail = require('./sendMail')

const redirectToError = require('./redirectToError')

const crypto = require('crypto')

// This little snippet hides secrets from the address bar and the browser
// history so that they are not inadvertently revealed in screenshots.
const hideSecretsFromAddressBarAndBrowserHistory = `
  <script>
    const secretHexademicalStringOf32CharactersOrMore = /[0-9,a-z]{32,}/g

    if (secretHexademicalStringOf32CharactersOrMore.exec(window.location.href) !== null) {
      // Hide the secret URL fragment so it is not accidentally displayed
      // in screenshots and is not added to the browser history.
      history.replaceState({}, '', window.location.href.replace(secretHexademicalStringOf32CharactersOrMore, '…'))
    }
  </script>
`

const header = require('./header-template')
const footer = require('./footer-template')

// Create a cryptographically-secure path for the admin route
// and save it in a table called admin in the built-in JSDB database.
if (db.admin === undefined) {
  db.admin = {}
  db.admin.route = crypto.randomBytes(16).toString('hex')
}

if (db.banned === undefined) {
  db.banned = []
}

module.exports = app => {
  // This is where we define the secret admin route and carry out one-time
  // global initialisation for the SMTP server.

  // Add admin route using cryptographically-secure secret path.
  app.get(`/admin/${db.admin.route}`, (request, response) => {

    const signatories = []
    let signatoryCount = 0
    db.confirmedSignatories.forEach(signatory => {
      signatoryCount++
      signatories.push(
        `<tr>
          <td>${signatoryCount}</td>
          <td>${signatory.signatory}</td>
          <td><a href='${signatory.link}'>${signatory.link}</a></td>
          <td>${signatory.name}</td>
          <td><a href='mailto: ${signatory.email}'>${signatory.email}</a></td>
          <td><a class='iconLink' href='/admin/${db.admin.route}/edit/${signatory.id}' nofollow>✏️</a></td>
          <td><a class='iconLink' href='/admin/${db.admin.route}/delete/${signatory.id}' nofollow>❌</a></td>
          <td><input type='checkbox' name='ban' value='${signatory.id}'></input>
        </tr>`
      )
    })

    response.html(`
      ${header()}
      <h2><a href='/admin/${db.admin.route}'>Admin page</a></h2>
      <p>📈 <a href='https://${app.site.prettyLocation()}${app.site.stats.route}'>Site statistics</a></p>
      <h3>Signatories (${signatories.length}) <a href='#banButton'>↓</a></h3>
      <form class='admin' method='POST' action='/admin/${db.admin.route}/ban'>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Signatory</th>
              <th>Link</th>
              <th>Name</th>
              <th>Email</th>
              <th class='iconHeader'></th>
              <th class='iconHeader'></th>
              <th class='iconHeader'></th>
            </tr>
          </thead>
          <tbody>
            ${signatories.join('\n')}
          </tbody>
        </table>
      <input id='banButton' class='admin' type='submit' name='adminAction' value='Ban selected'></input>
      <p class='refreshLink'><a href='/admin/${db.admin.route}/#banButton'>Refresh list</a></p>
    </form>
    ${footer(true, hideSecretsFromAddressBarAndBrowserHistory)}
    `)
  })

  function findSignatoryWithId (id) {
    let _index = null
    const signatory = db.confirmedSignatories.find((value, index) => {
      if (value) {
        if (value.id === id) {
          _index = index
          return true
        }
      }
    })
    return [signatory, _index]
  }

  // Add GET route to edit signatory.
  app.get(`/admin/${db.admin.route}/edit/:id`, (request, response) => {

    const id = request.params.id
    const [signatory] = findSignatoryWithId(id)

    response.html(`
      ${header()}
      <h2><a href='/admin/${db.admin.route}'>Admin page</a></h2>
      <p>📈 <a href='https://${app.site.prettyLocation()}${app.site.stats.route}'>Site statistics</a></p>
      <h3>Signatories</h3>
      <p><strong>✏️ Edit signatory</strong></p>
      <form method='POST' action='/admin/${db.admin.route}/edit/${id}' class='edit'>
        <ul>
          <li>
            <label for='signatory'>Signatory</label>
            <div class='inputWithCheckmark'>
              <input id='signatory' name='signatory' value='${signatory.signatory}' type='text' required maxlength='93'/>
              <div class='checkmark'><img src='/checkmark.svg'></div>
            </div>
          </li>
          <li>
            <label for='link'>Link</label>
            <div class='inputWithCheckmark'>
              <input id='link' name='link' type='url' value='${signatory.link}' required pattern='^https:\\/\\/[^ "<>%{}|\\\\^\`]+\\.[^ "<>%{}|\\\\^\`]+$' maxlength='256'/>
              <div class='checkmark'><img src='/checkmark.svg'></div>
            </div>
          </li>
          <li>
            <label for='name'>Name</label>
            <div class='inputWithCheckmark'>
              <input id='name' name='name' value='${signatory.name}' type='text' required spellcheck='false' autocomplete='name' maxlength="93"/>
              <div class='checkmark'><img src='/checkmark.svg'></div>
            </div>
          </li>
          <li>
            <label for='email'>Email</label>
            <div class='inputWithCheckmark'>
              <input id='email' name='email' type='email' value = '${signatory.email}' required spellcheck='false' autocomplete='email' maxlength='254' pattern="^[a-zA-Z0-9.!#$%&'*+/=?^_\`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$"/>
              <div class='checkmark'><img src='/checkmark.svg'></div>
            </div>
          </li>
          <li>
            <input id='updateButton' type='submit' value='✏️ Update'></input>
          </li>
        </ul>
        <input type='hidden' name='id' value='${id}'></input>
      </form>
      ${footer(true, hideSecretsFromAddressBarAndBrowserHistory)}
    `)
  })

  // Add POST route to actually update edited signatory.
  app.post(`/admin/${db.admin.route}/edit/:id`, (request, response) => {
    const id = request.body.id

    // Note: we do not perform any server-side validation in this route
    // as we treat data sent to admin routes as trusted. (If the admin
    // route URL is compromised, we have bigger problems.)
    const signatory = request.body.signatory
    const link = request.body.link
    const name = request.body.name
    const email = request.body.email

    if (id == undefined) {
      return redirectToError(response, 'Nothing to update.')
    }

    const [currentSignatory, index] = findSignatoryWithId(id)

    if (index === null) {
      return redirectToError(response, 'Signatory not found.')
    }

    const updatedSignatory = { id, signatory, link, name, email }

    db.confirmedSignatories[index] = updatedSignatory

    response.html(`
      ${header()}
      <h2><a href='/admin/${db.admin.route}'>Admin page</a></h2>
      <p>📈 <a href='https://${app.site.prettyLocation()}${app.site.stats.route}'>Site statistics</a></p>
      <h3>Signatories</h3>
      <p>Signatory updated!</p>
      <ul>
        <li><strong>Signatory:</strong> ${signatory}</li>
        <li><strong>Link:</strong> ${link}</li>
        <li><strong>Name:</strong> ${name}</li>
        <li><strong>Email:</strong> ${email}</li>
      </ul>
      <p><a href='/admin/${db.admin.route}/'>Back to signatory list</a></p>
      ${footer(true, hideSecretsFromAddressBarAndBrowserHistory)}
    `)
  })

  // Add GET route to confirm deletion of signatory.
  app.get(`/admin/${db.admin.route}/delete/:id`, (request, response) => {

    const id = request.params.id
    const [signatory] = findSignatoryWithId(id)

    response.html(`
      ${header()}
      <h2><a href='/admin/${db.admin.route}'>Admin page</a></h2>
      <p>📈 <a href='https://${app.site.prettyLocation()}${app.site.stats.route}'>Site statistics</a></p>
      <h3>Signatories</h3>
      <p><strong>💀 Do you really want to delete the following signatory?</strong></p>
      <form method='POST' action='/admin/${db.admin.route}/delete/${id}' class='deleteConfirmation'>
        <ul class='signatoryDetails'>
          <li><strong>Signatory</strong> ${signatory.signatory}</li>
          <li><strong>Link</strong> ${signatory.link}</li>
          <li><strong>Name</strong> ${signatory.name}</li>
          <li><strong>Email</strong> ${signatory.email}</li>
        </ul>
        <input type='hidden' name='id' value='${id}'></input>
        <input type='submit' value='💀 Delete'></input>
      </form>
      ${footer(true, hideSecretsFromAddressBarAndBrowserHistory)}
    `)
  })

  // Add POST route to actually delete signatory.
  app.post(`/admin/${db.admin.route}/delete/:id`, (request, response) => {
    const id = request.body.id

    if (id == undefined) {
      return redirectToError(response, 'Nothing to delete.')
    }

    const [signatory, index] = findSignatoryWithId(id)

    if (index === null) {
      return redirectToError(response, 'Signatory not found.')
    }

    delete db.confirmedSignatories[index]

    response.html(`
      ${header()}
      <h2><a href='/admin/${db.admin.route}'>Admin page</a></h2>
      <p>📈 <a href='https://${app.site.prettyLocation()}${app.site.stats.route}'>Site statistics</a></p>
      <h3>Signatories</h3>
      <p>Signatory ${signatory.signatory} (${signatory.link}) submitted by ${signatory.name} (${signatory.email}) has been deleted.</p>
      <p><a href='/admin/${db.admin.route}/'>Back to signatory list</a></p>
      ${footer(true, hideSecretsFromAddressBarAndBrowserHistory)}
    `)
  })

  // Add POST route to ban signatories.
  //
  // (Banning adds email address to the banned table in the database in addition
  // to deleting the corresponding signature.)
  app.post(`/admin/${db.admin.route}/ban/`, (request, response) => {
    let ban = request.body.ban

    if (typeof ban === 'string') {
      ban = [ban]
    }

    console.log('Ban', ban)

    if (ban == undefined) {
      return redirectToError(response, 'Nothing to ban.')
    }

    const bannedEmails = []

    ban.forEach(id => {
      const [signatory, index] = findSignatoryWithId(id)

      if (index === null) {
        return redirectToError(response, `Signatory with id ${id} not found.`)
      }

      const emailToBan = db.confirmedSignatories[index].email

      if (emailToBan === null) {
        return redirectToError(response, `Cannot ban signatory with id ${id}: email is null.`)
      }

      console.log('Banning', emailToBan)
      db.banned.push(emailToBan)

      bannedEmails.push(emailToBan)

      console.log('Deleting signature of', emailToBan)
      delete db.confirmedSignatories[index]
    })

    const bannedEmailsListHtml = bannedEmails.reduce((html, emailAddress) => html += `<li>${emailAddress}</li>`, '')

    response.html(`
      ${header()}
      <h2><a href='/admin/${db.admin.route}'>Admin page</a></h2>
      <p>📈 <a href='https://${app.site.prettyLocation()}${app.site.stats.route}'>Site statistics</a></p>
      <h3>Signatories</h3>
      <p>The following spammers have been banned:</p>
      <h2>👋🤓</h2>
      <ul>
        ${bannedEmailsListHtml}
      </ul>
      <p><a href='/admin/${db.admin.route}/#banButton'>Back to signatory list</a></p>
      ${footer(true, hideSecretsFromAddressBarAndBrowserHistory)}
    `)
  })

  // Output admin path to logs so we know what it is.
  // (If someone has ssh access to our server to see this all is already lost anyway.)
  console.log(`   🔑️    ❨web0❩ Admin page is at /admin/${db.admin.route}`)

  console.log('   📬    ❨web0❩ Starting SMTP server.')

  const tlsCertificatePath = path.join(os.homedir(), '.small-tech.org', 'site.js', 'tls', 'global', 'production', os.hostname())
  const keyPath = path.join(tlsCertificatePath, 'certificate-identity.pem') // Secret key path.
  const certPath = path.join(tlsCertificatePath, 'certificate.pem')

  //
  // SMTP Server configuration.
  //

  const key = fs.readFileSync(keyPath)
  const cert = fs.readFileSync(certPath)
  // const secure = true
  const size = 51200
  const banner = 'Welcome to the web0 SMTP Server'
  const disabledCommands = ['AUTH']

  const getNameFromAddressObject = addressObject => {
    let name = ''
    if (addressObject.name != undefined) {
      const names = addressObject.name.split(' ')
      name = ` ${names.length > 0 ? names[0] : addressObject.name}`
    }
    return name
  }

  const forwardEmailWithSessionIdToHumans = (message, envelope) => {

    // Sanity check. Ensure the mail envelope is correct before continuing.
    if (envelope == undefined || envelope.mailFrom == undefined || envelope.rcptTo == undefined || envelope.rcptTo.length === 0) {
      return console.error('Cannot forward email. Message envelope is wrong.', envelope)
    }

    const fromAddress = envelope.mailFrom.address
    const toAddress = envelope.rcptTo[0].address

    const fromName = message.from == undefined ? '' : getNameFromAddressObject(message.from)
    const toName = message.to == undefined ? '' : getNameFromAddressObject(message.to)

    const subject = message.subject == undefined ? '(no subject)' : message.subject

    const ccHeader = message.cc == undefined ? '' : `\n> CC: ${message.cc}`
    const messageDateHeader = message.date == undefined ? '' : `\n> Date: ${message.date}`

    const text = `Hello${fromName},

Thanks for writing in.

I’m CCing Laura and Aral at Small Technology Foundation so you can talk to a human being.

Lots of love,
Computer @ web0.small-web.org

> From:${fromName} <${fromAddress}>
> To:${toName} ${toAddress}${ccHeader}${messageDateHeader}
> Subject: ${subject}
>
${message.text.split('\n').map(line => `> ${line}`).join('\n')}
`
    try {
      sendMail(/* to */ fromAddress, `FWD: ${subject}`, text, 'hello+web0@small-tech.org')
    } catch (error) {
      console.error(error)
    }
  }

  const onConnect = (session, callback) => {
    console.log('   📬    ❨web0❩ Starting new session with email client.')
    console.log(session)

    // Always accept the connection.
    callback()
  }

  const onMailFrom = (address, session, callback) => {
    console.log('   📬    ❨web0❩ Got mail from command.')
    console.log('address', address)
    console.log('session', session)

    // Accept all addresses that pass Nodemailer’s own cursory tests.
    callback ()
  }

  const onRcptTo = (address, session, callback) => {
    // First check size.
    // TODO.
    console.log('   📬    ❨web0❩ Got rcpt to command.')

    // There’s only one account here.
    return address.address === 'computer@web0.small-web.org' ?
      callback() :
      callback(new Error("Address not found."))
  }

  // Called when a readable stream is available for the email.
  const onData = async (stream, session, callback) => {

    console.log('onData: session =', session)

    // Save the envelope here because it will have changed by the
    // time we get past the async await of the parser.
    const envelope = session.envelope

    // Persist session in local memory.
    let message
    try {
      message =  await simpleParser(stream)
    } catch (error) {
      console.error(error)
      return callback(error)
    }

    console.log('message', message)

    // Acknowledge that we’ve received the message.
    callback()

    forwardEmailWithSessionIdToHumans(message, envelope)
  }

  const onClose = session => {
    console.log('   📬    ❨web0❩ Email client closed (got quit command).')
    console.log('session', session)
  }

  const server = new SMTPServer({
    banner,
    disabledCommands,
    cert,
    key,
    size,
    onConnect,
    onMailFrom,
    onRcptTo,
    onData,
    onClose
  })

  server.on('error', error => {
    // TODO: Handle errors better.
    console.error('[SMTP Server Error] ', error.message)
  })

  // Clean up the mail server when the main server is shutting down.
  app.site.server.on('close', async () => {
    console.log('   📬    ❨web0❩ Main server shutdown detected, asking mail server to close.')
    server.close(() => {
      console.log('   📬    ❨web0❩ Mail server closed.')
    })
  })

  server.listen(25)
}
