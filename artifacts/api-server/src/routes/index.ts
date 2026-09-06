import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pilotRouter from "./pilot";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pilotRouter);

export default router;
