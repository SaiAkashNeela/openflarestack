import { Hono } from 'hono'
import type { AppEnv } from '../index'
const route = new Hono<AppEnv>()
export default route
