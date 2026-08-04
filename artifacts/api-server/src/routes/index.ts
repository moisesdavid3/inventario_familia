import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import salesRouter from "./sales";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(salesRouter);
router.use(reportsRouter);

export default router;
