import { Router, type IRouter } from "express";
import healthRouter from "./health";
import companiesRouter from "./companies";
import productsRouter from "./products";
import salesRouter from "./sales";
import purchasesRouter from "./purchases";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(companiesRouter);
router.use(productsRouter);
router.use(salesRouter);
router.use(purchasesRouter);
router.use(reportsRouter);

export default router;
