import 'dotenv/config'

import fastify, {FastifyReply} from 'fastify'
import socketioServer from 'fastify-socket.io'
import {Socket} from 'socket.io'

const fs = require('fs')

const SSHClient = require('ssh2').Client

const app = fastify({
    logger: true,
    disableRequestLogging: true,
})

app.get('/', (req, reply: FastifyReply) => {
    reply.code(200).type('text/html').send(fs.createReadStream('./index.html'))
})

app.register(socketioServer, {
    path: '/io',
    cors: {
        origin: true,
    },
})

app.ready(async (err) => {
    if (err) throw err

    app.io.on('connection', async (socket: Socket) => {
        let socket_id = socket.id
        try {
            let token = socket.handshake.auth.token.toString()
            app.log.info(`socket connected: token: ${token} ${socket_id}`)
        } catch (e) {
            socket.disconnect()
            app.log.error(`socket connected error: ${socket_id}`)
            return
        }

        const ssh = new SSHClient()
        ssh.on('ready', () => {
            socket.emit('log', 'ssh 准备连接')
            ssh.shell((err, stream) => {
                if (err) {
                    socket.emit('log', `ssh 出现错误 ${err}`)
                }
                socket.emit('log', 'ssh 连接成功')

                stream.on('data', (data) => socket.emit('terminal', data.toString('binary')))
                stream.on('resize', (data) => {
                    stream.rows = data.rows
                    stream.columns = data.cols
                    stream.emit('resize')
                })

                stream.on('close', () => {
                    socket.emit('log', `ssh 结束`)
                })

                socket.on('terminal', (data) => stream.write(data))
            })
        })

        ssh.on('close', () => {
            socket.emit('log', `ssh 关闭连接`)
        })

        ssh.on('error', (err) => {
            console.log(err)
            socket.emit('log', `ssh 连接失败 ${err}`)
        })

        ssh.connect({
            host: process.env.SSH_HOST,
            port: process.env.SSH_PORT,
            username: process.env.SSH_USERNAME,
            password: process.env.SSH_PASSWORD,
        })

        socket.on('disconnect', () => {
            app.log.info(`socket disconnect: ${socket_id}`)
        })
    })
})

app.listen({
    host: process.env.HTTP_HOST,
    port: Number(process.env.HTTP_PORT),
})
