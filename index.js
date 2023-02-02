const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken')
require('dotenv').config();

//middleware
app.use(cors());
app.use(express.json());
function verifyJWT(req, res, next){
  
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send('unauthorized access')
  }
  const token = authHeader.split(' ')[1];
  
  jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
    if(err){
      return res.status(403).send({message: 'forbidden access'})
    }
    req.decoded = decoded;
    next();
  })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sr446qq.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });



async function run(){
    try{
        await client.connect();
        const servicesCollection = client.db('doctor_portal').collection('services');
        const bookingsCollection = client.db('doctor_portal').collection('booking');
        const usersCollection = client.db('doctor_portal').collection('users');

        //use aggregate to query multi collection and then merge data
        app.get('/appointmentOptions', async(req,res)=>{
            const date = req.query.date;
            const query ={};
            const options = await servicesCollection.find(query).toArray();
            const bookingQuery = {date: date};
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();
            options.forEach(option=>{
              const optionBooked = alreadyBooked.filter(book=> book.treatment === option.name);
              const bookedSlots = optionBooked.map(book=>book.slot);
              const remainingSlots = option.slots.filter(slot=> !bookedSlots.includes(slot));
              option.slots = remainingSlots;
            })
            res.send(options);
          })
          
          
          app.get('/bookings',verifyJWT, async(req,res)=>{
            const email = req.query.email;

            const decodedEmail = req.decoded.email;
            if(email !== decodedEmail){
              return res.status(403).send({message: 'forbidden access'})
            }

            const query = {patient:email}
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings)
      
          })

          app.post('/bookings', async (req, res) => {
            const booking = req.body;
            
            const query = {
                date: booking.date,
                patient: booking.patient,
                treatment: booking.treatment 
            }

            const alreadyBooked = await bookingsCollection.findOne(query);

            if (alreadyBooked){
                const message = `You already have a booking on ${booking.date}`
                return res.send({acknowledged: false, message})
            }

            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        })

        app.get('/jwt', async(req,res)=>{
          const email = req.query.email;
            const query = {email:email}
            const user = await usersCollection.findOne(query)
            if(user){
              const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '1h'})
              return res.send({accessToken: token})
            }
            res.status(403).send({accessToken: 'token'})
        })

        app.post('/users', async(req,res)=>{
          const user = req.body;
          const result = await usersCollection.insertOne(user);
          res.send(result)
        })

        app.get('/users', async(req,res)=>{
          const query={}
          const user = await usersCollection.find(query).toArray();
          res.send(user)
        })

        //admin
        app.put('/users/admin/:id',verifyJWT, async(req,res)=>{
          const decodedEmail = req.decoded.email;
          const query = {email: decodedEmail};
          const user = await usersCollection.findOne(query);
          if(user?.role !== 'admin'){
            return res.status(403).send({message: 'forbidden access'})
          }

          const id = req.params.id;
          const filter = { _id: ObjectId(id)}
          const options = {upsert: true}
          const updated ={
            $set: {
              role: 'admin'
            }
          }
          const result = await usersCollection.updateOne(filter, updated, options);
          res.send(result);
        })

        app.get('/users/admin/:email', async(req,res)=>{
          const email = req.params.email;
          const query = {email};
          const user = await usersCollection.findOne(query);
          res.send({isAdmin: user?.role === 'admin'})
        })

        app.get('/appointmentSpecialty', async(req,res)=>{
          const query = {}
          const result = await servicesCollection.find(query).project({name: 1}).toArray();
          res.send(result);
        })

    }
    finally{}
}

run().catch(console.dir)
app.get('/', (req, res) => {
    res.send('Hello from doctor Uncle!') 
  })
  
  app.listen(port, () => {
    console.log(`Doctors app port ${port}`)
  })