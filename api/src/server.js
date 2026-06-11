require('dotenv').config()
const fastify = require('fastify')({ logger: true })

async function build() {
  await fastify.register(require('@fastify/cors'), { origin: true })

  await fastify.register(require('@fastify/jwt'), {
    secret: process.env.JWT_SECRET,
    sign: { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
  })

  fastify.decorate('authenticate', async (request, reply) => {
    await request.jwtVerify()
  })

  fastify.decorate('requireTeacher', async (request, reply) => {
    if (request.user.role !== 'teacher') {
      return reply.code(403).send({ error: 'Forbidden' })
    }
  })

  fastify.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: 'Validation Error', details: error.validation })
    }
    if (error.code === '23505') {
      return reply.code(409).send({ error: 'Conflict', message: 'Resource already exists' })
    }
    fastify.log.error(error)
    reply.code(error.statusCode || 500).send({ error: error.message || 'Internal Server Error' })
  })

  fastify.register(require('./routes/auth'),     { prefix: '/auth' })
  fastify.register(require('./routes/students'), { prefix: '/students' })
  fastify.register(require('./routes/content'),  { prefix: '/content' })
  fastify.register(require('./routes/sessions'))
  fastify.register(require('./routes/ranking'))
  fastify.register(require('./routes/dashboard'))

  return fastify
}

async function start() {
  const app = await build()
  try {
    await app.listen({ port: parseInt(process.env.PORT) || 3000, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()
