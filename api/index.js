const axios = require('axios');
const CryptoJS = require('crypto-js');
const yup = require('yup');

const FUND_TYPES = {
  equity: 1,
  balanced: 0,
  fixed_income: 2,
  money_market: 3,
};

const SORTS = {
  name: { by: 7 },
  return_1d: { by: 5, period: '1d' },
  return_1m: { by: 5, period: '1m' },
  return_1y: { by: 5, period: '1y' },
  return_3y: { by: 5, period: '3y' },
  return_5y: { by: 5, period: '5y' },
  return_ytd: { by: 5, period: 'ytd' },
  drawdown_1y: { by: 4 },
  aum: { by: 2 },
};

const decrypt = data => {
  const iv = CryptoJS.enc.Hex.parse(data.slice(0, 32));
  const encryptedData = data.slice(32, -32);
  const secret = CryptoJS.enc.Utf8.parse(data.slice(-32));

  const bytes = CryptoJS.AES.decrypt(encryptedData, secret, {
    iv,
    mode: CryptoJS.mode.CBC,
    format: CryptoJS.format.Hex,
  });

  return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
};

const validate = async (params) => {
  const schema = yup.object().shape({
    search: yup.string().trim().default(''),
    page: yup.number().positive().integer().default(1),
    per_page: yup.number().positive().integer().default(25),
    buy_from_bibit: yup.boolean().default(false),
    types: yup.array(
      yup.string().trim().lowercase().oneOf(Object.keys(FUND_TYPES))
    ).default([]),
    sharia: yup.boolean().default(false),
    usd: yup.boolean().default(false),
    sort_by: yup.string().trim().lowercase().oneOf(Object.keys(SORTS)).default('name'),
    sort_direction: yup.string().trim().lowercase().oneOf(['asc', 'desc']).default('asc'),
  });

  if (typeof params.types === 'string') {
    params.types = params.types.split(',');
  }

  await schema.validate(params);

  const data = schema.cast(params);

  const types = [...new Set(data.types)].map(type => FUND_TYPES[type]);

  const { by, period = '' } = SORTS[data.sort_by];

  return {
    name: data.search,
    page: data.page,
    limit: data.per_page,
    tradable: data.buy_from_bibit ? 1 : '',
    type: types.join(','),
    syariah: data.sharia ? 1 : '',
    usd: data.usd ? 1 : '',
    sort: data.sort_direction,
    sort_by: by,
    sort_period: period,
  };
};

const getData = async (params = {}) => {
  const parsedParams = await validate(params);

  try {
    const response = await axios.request({
      method: 'GET',
      url: 'https://api.bibit.id/products/list',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        Pragma: 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:47.0) Gecko/20100101 Firefox/47.0',
        Origin: 'https://bibit.id',
      },
      params: parsedParams,
    });

    return decrypt(response.data.data);
  } catch (error) {
    const message = error.response ? error.response.data.message : error.message;

    throw new Error(message);
  }
};

module.exports = async (req, res) => {
  try {
    const data = await getData(req.query);

    return res.json({ data });
  } catch (error) {
    const status = error.name === 'ValidationError' ? 422 : 500;

    return res.status(status).json({ error: error.message });
  }
};