import express from 'express';

import {
  addField,
  getUserFields,
  getField,
  updateField,
  deleteField,
} from '../controllers/farmField.controller.js';

const router =
  express.Router();

/*
|--------------------------------------------------------------------------
| CREATE
|--------------------------------------------------------------------------
|
| POST /api/field/add-field/:userId
|
*/

router.post(
  '/add-field/:userId',
  addField,
);

/*
|--------------------------------------------------------------------------
| GET ALL USER FARMS
|--------------------------------------------------------------------------
|
| GET /api/field/user/:userId
|
*/

router.get(
  '/user/:userId',
  getUserFields,
);

/*
|--------------------------------------------------------------------------
| GET SINGLE FARM
|--------------------------------------------------------------------------
|
| GET /api/field/:fieldId
|
*/

router.get(
  '/:fieldId',
  getField,
);

/*
|--------------------------------------------------------------------------
| UPDATE FARM
|--------------------------------------------------------------------------
|
| PUT /api/field/:fieldId
|
*/

router.put(
  '/:fieldId',
  updateField,
);

/*
|--------------------------------------------------------------------------
| DELETE FARM
|--------------------------------------------------------------------------
|
| DELETE /api/field/:fieldId
|
*/

router.delete(
  '/:fieldId',
  deleteField,
);

export default router;