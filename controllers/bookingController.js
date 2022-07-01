const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Tour = require('../models/tourModel');
const User = require('../models/userModel');
const Booking = require('../models/bookingModel');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');

exports.getBooking = factory.getOne(Booking);
exports.getAllBookings = factory.getAll(Booking);
exports.addBooking = factory.createOne(Booking);
exports.updateBooking = factory.updateOne(Booking);
exports.deleteBooking = factory.deleteOne(Booking);

exports.getCheckoutSession = catchAsync(async (req, res, next) => {
  //1 get the currently selected tour
  const tour = await Tour.findById(req.params.tourId);

  //2 create checkout session with stripe
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    // success_url: `${req.protocol}://${req.get('host')}/?tour=${
    //   req.params.tourId
    // }&user=${req.user.id}&price=${tour.price}`,
    success_url: `https://${req.get('host')}/my-tours`,
    cancel_url: `https://${req.get('host')}/tour/${tour.slug}`,
    customer_email: req.user.email,
    client_reference_id: req.params.tourId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: tour.price * 100,
          product_data: {
            name: `${tour.name} Tour`,
            description: tour.summary,
            images: [
              `https://lienhard-node-proj.herokuapp.com/img/tours/${tour.imageCover}`,
            ],
          },
        },
      },
    ],
    mode: 'payment',
  });

  //3 send session to client
  res.status(200).json({
    status: 'success',
    session,
  });
});

//create booking in database
// exports.createBookingCheckout = catchAsync(async (req, res, next) => {
//   //temporary solution before hosting
//   const { tour, user, price } = req.query;
//   if (!tour || !user || !price) {
//     return next();
//   }
//   await Booking.create({ tour, user, price });

//   res.redirect(req.originalUrl.split('?')[0]);
// });

const createCheckoutBooking = async (session) => {
  const tour = session.client_reference_id;
  const user = (await User.findOne({ email: session.customer_email })).id;
  const price = session.amount_total / 100;

  await Booking.create({ tour, user, price });
};

exports.webhookCheckout = (req, res, next) => {
  const signature = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    createCheckoutBooking(event.data.object);
  }
  res.status(200).json({ received: true });
};
